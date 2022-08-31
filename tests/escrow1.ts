import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import * as spl from '@solana/spl-token';
import { assert, expect } from "chai";
import { Escrow1 } from "../target/types/escrow1";
import { SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
const { SystemProgram } = anchor.web3;

describe( "escrow1", () =>
{
  // configure client to use the local cluster.
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider( provider );

  const program = anchor.workspace.Escrow1 as Program<Escrow1>;
  const tokenAmount = new anchor.BN( 20 );
  const priceExpected = new anchor.BN( 10 );

  let initializer: anchor.web3.Keypair;
  let tokenMint: anchor.web3.Keypair;
  let tokenMintAccount: anchor.web3.PublicKey;
  let initializerToken: anchor.web3.Keypair;
  let initializerTokenAccount: anchor.web3.PublicKey;
  let taker: anchor.web3.Keypair;
  let initializerTokenAccountBal: anchor.BN;

  beforeEach( async function ()
  {
    //fund initializer wallet
    const fundInitializer = async ( connection: anchor.web3.Connection ) =>
    {
      initializer = anchor.web3.Keypair.generate();
      const fundTx = new anchor.web3.Transaction();

      fundTx.add( anchor.web3.SystemProgram.transfer( {
        fromPubkey: provider.wallet.publicKey,
        toPubkey: initializer.publicKey,
        lamports: 10 * anchor.web3.LAMPORTS_PER_SOL,
      } ) );

      const fundTxSig = await provider.sendAndConfirm( fundTx );
      console.log( `initializer wallet ${ initializer.publicKey.toBase58() } funded with 10 SOL tx: ${ fundTxSig }` );
    };

    //fund taker wallet
    const fundTaker = async ( connection: anchor.web3.Connection ) =>
    {
      taker = anchor.web3.Keypair.generate();
      const fundTx = new anchor.web3.Transaction();

      fundTx.add( anchor.web3.SystemProgram.transfer( {
        fromPubkey: provider.wallet.publicKey,
        toPubkey: taker.publicKey,
        lamports: 10 * anchor.web3.LAMPORTS_PER_SOL,
      } ) );

      const fundTxSig = await provider.sendAndConfirm( fundTx );
      console.log( `taker wallet ${ taker.publicKey.toBase58() } funded with 10 SOL tx: ${ fundTxSig }` );
    };

    //create new mint
    const newMint = async ( connection: anchor.web3.Connection ) =>
    {
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
    const fundNewTokenAccount = async ( connection: anchor.web3.Connection ) =>
    {
      initializerToken = anchor.web3.Keypair.generate();
      const lamports = await provider.connection.getMinimumBalanceForRentExemption( spl.AccountLayout.span );

      const fundTokenAccountTx = new anchor.web3.Transaction();

      fundTokenAccountTx.add(
        anchor.web3.SystemProgram.createAccount( {
          fromPubkey: initializer.publicKey,
          newAccountPubkey: initializerToken.publicKey,
          space: spl.AccountLayout.span,
          lamports,
          programId: spl.TOKEN_PROGRAM_ID,
        } )
      );

      fundTokenAccountTx.add(
        spl.createInitializeAccountInstruction(
          initializerToken.publicKey,
          tokenMint.publicKey,
          initializer.publicKey,
          spl.TOKEN_PROGRAM_ID,
        )
      );

      fundTokenAccountTx.add(
        spl.createMintToInstruction(
          tokenMint.publicKey,
          initializerToken.publicKey,
          provider.wallet.publicKey,
          50,
          [],
          spl.TOKEN_PROGRAM_ID,
        )
      );

      const fundTokenAccountTxSig = await provider.sendAndConfirm( fundTokenAccountTx, [ initializer, initializerToken ] );
      console.log( `New associated token account ${ initializerToken.publicKey } funded with 50 tokens tx:${ fundTokenAccountTxSig }` );
      const newtokenAccount = await spl.getAccount( provider.connection, initializerToken.publicKey );
      initializerTokenAccountBal = new anchor.BN( newtokenAccount.amount.toString() );
      return initializerToken.publicKey;
    };

    await fundInitializer( provider.connection );
    tokenMintAccount = await newMint( provider.connection );
    initializerTokenAccount = await fundNewTokenAccount( provider.connection );
    await fundTaker( provider.connection );

  } );

  it( "should init an escrow!", async () =>
  {
    const [ escrowPDA, escrowBump ] = await anchor.web3.PublicKey.findProgramAddress( [
      Buffer.from( anchor.utils.bytes.utf8.encode( "escrow" ) ),
      initializer.publicKey.toBuffer(),
    ],
      program.programId
    );

    const [ vaultPDA, vaultBump ] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from( anchor.utils.bytes.utf8.encode( "vault" ) ),
        initializer.publicKey.toBuffer(),
        tokenMint.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log( escrowPDA, vaultPDA );

    await program.methods
      .init( tokenAmount, priceExpected )
      .accounts( {
        escrow: escrowPDA,
        vault: vaultPDA,
        initializer: initializer.publicKey,
        initializerToken: initializerTokenAccount,
        tokenMint: tokenMintAccount,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      } )
      .signers( [ initializer ] )
      .rpc();

    console.log( 'escrow initialized' );

    // assert that 20 tokens has been transfered from initTokenAccount to vaultAccount
    const tokenAccountNewBal = initializerTokenAccountBal.toNumber() - tokenAmount.toNumber();
    assert.equal( tokenAccountNewBal, 30 );
    const initTokenAccount = await spl.getAccount( provider.connection, initializerTokenAccount );
    assert.equal( initTokenAccount.amount.toString(), "30" );

    const vaultAccount = await spl.getAccount( provider.connection, vaultPDA );
    assert.equal( vaultAccount.amount.toString(), tokenAmount.toString() );

    //assert that owner of vault is escrowPDA
    assert.equal( vaultAccount.owner.toString(), escrowPDA.toBase58() );

    //assert that escrow state has been populated
    const escrowAccount = await program.account.escrow.fetch( escrowPDA );
    console.log( `escrow account created by ${ escrowAccount.initializer }` );
    assert.equal( escrowAccount.isInitialized, true );
    assert.equal( escrowAccount.initializer.toString(), initializer.publicKey.toBase58() );
    assert.equal( escrowAccount.vault.toString(), vaultPDA.toBase58() );
    assert.equal( escrowAccount.tokenAmount.toNumber(), tokenAmount.toNumber() );
    assert.equal( escrowAccount.expectedPrice.toNumber(), priceExpected.toNumber() );
    assert.equal( escrowAccount.escrowBump, escrowBump );
    assert.equal( escrowAccount.vaultBump, vaultBump );

  } );

  it( "should take the offer!", async () =>
  {
    const takerATA = await getAssociatedTokenAddress( tokenMint.publicKey, taker.publicKey );

    // get PDAs
    const [ vaultPDA, vaultBump ] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from( anchor.utils.bytes.utf8.encode( "vault" ) ),
        initializer.publicKey.toBuffer(),
        tokenMint.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [ escrowPDA, escrowBump ] = await anchor.web3.PublicKey.findProgramAddress( [
      Buffer.from( anchor.utils.bytes.utf8.encode( "escrow" ) ),
      initializer.publicKey.toBuffer(),
    ],
      program.programId
    );

    await program.methods
      .init( tokenAmount, priceExpected )
      .accounts( {
        initializer: initializer.publicKey,
        vault: vaultPDA,
        initializerToken: initializerTokenAccount,
        tokenMint: tokenMintAccount,
        escrow: escrowPDA,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      } )
      .signers( [ initializer ] )
      .rpc();

    console.log( 'escrow initialized' );
    const escAcc = await program.account.escrow.getAccountInfo( escrowPDA );
    console.log( escAcc.owner.toBase58() );

    await program.methods
      .accept( tokenAmount, priceExpected )
      .accounts( {
        escrow: escrowPDA,
        vault: vaultPDA,
        tokenMint: tokenMint.publicKey,
        takerToken: takerATA,
        taker: taker.publicKey,
        initializer: initializer.publicKey,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      } )
      .signers( [ taker ] )
      .rpc();

    console.log( 'escrow completed' );

  } );

} );
