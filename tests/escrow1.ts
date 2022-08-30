import * as anchor from "@project-serum/anchor";
import {
  AnchorError,
  LangErrorCode,
  LangErrorMessage,
  Program,
  ProgramError,
} from "@project-serum/anchor";
import * as spl from '@solana/spl-token';
import { publicKey } from "@project-serum/anchor/dist/cjs/utils";
import { assert } from "chai";
import { Escrow1 } from "../target/types/escrow1";
import { SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { utf8 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { BN } from "bn.js";
const { SystemProgram } = anchor.web3;

describe( "escrow1", async () => {
  // configure client to use the local cluster.
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider( provider );
  
  const program = anchor.workspace.Escrow1 as Program<Escrow1>;

  const initializer = anchor.web3.Keypair.generate();
  const initializerWallet = initializer.publicKey;
  const userToken = anchor.web3.Keypair.generate();

  let tokenMint: anchor.web3.Keypair;
  let initializerTokenAccountBal: anchor.BN;
  let userTokenAccount = userToken.publicKey;
  
  //fund initializer wallet
  const fundInitializer = async ( connection: anchor.web3.Connection ) => {
    const fundTx = new anchor.web3.Transaction();
    
    fundTx.add( anchor.web3.SystemProgram.transfer( {
      fromPubkey: provider.wallet.publicKey,
      toPubkey: initializer.publicKey,
      lamports: 10 * anchor.web3.LAMPORTS_PER_SOL,
    } ) );
    
    const fundTxSig = await provider.sendAndConfirm( fundTx );
    console.log( `initializer wallet ${ initializer.publicKey.toBase58() } funded with 10 SOL tx: ${ fundTxSig }` );
  };      
  await fundInitializer( provider.connection );
  
  //create new mint
  const newMint = async ( connection: anchor.web3.Connection ) => {
    tokenMint = anchor.web3.Keypair.generate();
    const lamportsForMint = await provider.connection.getMinimumBalanceForRentExemption( spl.MintLayout.span );
    
    const mintTx = new anchor.web3.Transaction();    
    
    mintTx.add(
      anchor.web3.SystemProgram.createAccount( {
        programId: spl.TOKEN_PROGRAM_ID,
        space: spl.MintLayout.span,
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: tokenMint.publicKey,
        lamports: lamportsForMint,
      } )
      );
      
      mintTx.add(
        spl.createInitializeMintInstruction(
          tokenMint.publicKey,
          0,
          provider.wallet.publicKey,
        provider.wallet.publicKey,
        spl.TOKEN_PROGRAM_ID,
        )
        );
        const mintTxsig = await provider.sendAndConfirm( mintTx, [ tokenMint ] );
    console.log( `New mint account ${ tokenMint.publicKey } created tx:${ mintTxsig }` );
    return tokenMint.publicKey;
  };
  
  //create and fund user token account
  const fundNewTokenAccount = async ( connection: anchor.web3.Connection ) => {
    const lamports =  await provider.connection.getMinimumBalanceForRentExemption(spl.AccountLayout.span);
    
    const fundTokenAccountTx = new anchor.web3.Transaction();
   
    fundTokenAccountTx.add(
      anchor.web3.SystemProgram.createAccount( {
        fromPubkey: initializerWallet,
        newAccountPubkey: userTokenAccount,
        space: spl.AccountLayout.span,
        lamports,
        programId: spl.TOKEN_PROGRAM_ID,
      } )
    );

    fundTokenAccountTx.add(        
      spl.createInitializeAccountInstruction(
        userTokenAccount,
        tokenMint.publicKey,
        initializerWallet,
        spl.TOKEN_PROGRAM_ID,     
        )
    );

    fundTokenAccountTx.add(
      spl.createMintToInstruction(
        tokenMint.publicKey,
        userTokenAccount,
        provider.wallet.publicKey,
        50,
        [],
        spl.TOKEN_PROGRAM_ID,     
        )
    );
    
    const fundTokenAccountTxSig = await provider.sendAndConfirm( fundTokenAccountTx, [ initializer, userToken ] );
    console.log( `New associated token account ${ userTokenAccount } funded with 50 tokens tx:${ fundTokenAccountTxSig }` );
    const newtokenAccount = await spl.getAccount(provider.connection, userTokenAccount);
    initializerTokenAccountBal = new anchor.BN(newtokenAccount.amount.toString()); 
    return userTokenAccount;        
  }

  const mint = await newMint( provider.connection );
  const initializerTokenAccount = await fundNewTokenAccount( provider.connection );
  const taker = anchor.web3.Keypair.generate();

  const tokenAmount = new anchor.BN( 20 );
  const priceExpected = new anchor.BN( 10 );
  
  const [ vaultPDA, vaultBump ] = await anchor.web3.PublicKey.findProgramAddress( [
    utf8.encode( "vault" ),
    initializer.publicKey.toBuffer(),
    tokenMint.publicKey.toBuffer(),
  //  tokenAmount.toBuffer( 'le' )
  ],
    program.programId
  );

  const [ escrowPDA, escrowBump ] = await anchor.web3.PublicKey.findProgramAddress( [
    utf8.encode( "escrow" ),
    initializer.publicKey.toBuffer(),
  ],
    program.programId
  );  
//  console.log( escrowPDA,  vaultPDA);

  it("should init an escrow", async () => {
   
      await program.methods
      .init( tokenAmount , priceExpected)
      .accounts( {
        initializer: initializerWallet,
        vault: vaultPDA,
        initializerToken: initializerTokenAccount,
        tokenMint: mint,
        escrow: escrowPDA,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      } )
      .signers([ initializer ])
      .rpc();
    
    console.log( 'escrow initialized' );

    // assert that 20 tokens has been transfered from initTokenAccount to vaultAccount
    const tokenAccountNewBal = initializerTokenAccountBal.toNumber() - tokenAmount.toNumber();
    assert.equal( tokenAccountNewBal, 30 );
    const initTokenAccount = await spl.getAccount( provider.connection, userTokenAccount );
    assert.equal( new anchor.BN(initTokenAccount.amount.toString()), new anchor.BN( "30" ) );
    
    const vaultAccount = await spl.getAccount( provider.connection, vaultPDA );
    assert.equal( new anchor.BN(vaultAccount.amount.toString()), tokenAmount ); 
    
    //assert that owner of vault is escrowPDA
    assert.equal(vaultAccount.owner, escrowPDA);

    //assert that escrow state has been populated
    const escrowAccount = await program.account.escrow.fetch( escrowPDA );
    console.log( `escrow account created ${ escrowAccount }` );
      
    assert.equal( escrowAccount.isInitialized, true );
    assert.equal( escrowAccount.initializer, initializer.publicKey );
    assert.equal( escrowAccount.vault, vaultPDA );
    assert.equal( escrowAccount.tokenAmount, tokenAmount );
    assert.equal( escrowAccount.expectedPrice, priceExpected );
    assert.equal( escrowAccount.escrowBump, escrowBump );

  });
    
       
  
});
