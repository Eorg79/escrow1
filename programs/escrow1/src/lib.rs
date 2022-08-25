use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{CloseAccount, Mint, Token, TokenAccount, Transfer},
};

//declare program id
declare_id!("B9fCRaaFUtSRoxEVJhCWCAgoMydZZq6iBeMqMzU3RYjY");

//business logic
#[program]
pub mod escrow1 {

    use super::*;

    pub fn init(ctx: Context<Init>, token_amount: u64, price_expected: u64) -> Result<()> {
        let initializer: &Signer = &ctx.accounts.initializer;
        let escrow = &mut ctx.accounts.escrow;
        let vault: &mut Account<TokenAccount> = &mut ctx.accounts.vault;

        //set escrow state
        escrow.is_initialized = true;
        escrow.initializer = *initializer.key;
        escrow.vault = vault.key();
        escrow.token_amount = token_amount;
        escrow.expected_price = price_expected;
        escrow.escrow_bump = *ctx.bumps.get("escrow").unwrap();

        // transfer tokens from initializer token account to vault
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.initializer_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.initializer.to_account_info(),
            },
        );
        anchor_spl::token::transfer(cpi_ctx, token_amount)?;

        Ok(())
    }

    pub fn accept(ctx: Context<Accept>, token_amount: u64, vault_bump: u8, price_expected: u64) -> Result<()> {
        
        //transfer price from taker wallet to initializer wallet
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.taker.to_account_info(),
                to: ctx.accounts.initializer.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, price_expected)?;

        //program signer
        let escrow_seeds = &[
            b"escrow",
            ctx.accounts.initializer.key().as_ref(),
            &[ctx.accounts.escrow.escrow_bump],
        ];
        let signer = &[&escrow_seeds[..]];

        // transfer tokens from vault to taker token account
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.taker_token.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer,
        );
        anchor_spl::token::transfer(cpi_ctx, token_amount)?;

        //close vault
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.initializer_token.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer,
        );
        anchor_spl::token::close_account(cpi_ctx)?;

        Ok(())
    }
}

// data structure stored by escrow state account
#[account]
#[derive(Debug)]
pub struct Escrow {
    pub is_initialized: bool,
    pub initializer: Pubkey,
    pub vault: Pubkey,
    pub token_amount: u64,
    pub expected_price: u64,
    pub escrow_bump: u8,
}

impl Escrow {
    // + 8 to store the discriminator
    const LEN: usize = 8 + 1 + 32 + 32 + 8 + 8;
}

//validation struct
#[derive(Accounts)]
#[instruction(token_amount: u64)]
pub struct Init<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(
        init,
        payer = initializer,
        seeds = [b"vault", initializer.key().as_ref(), token_mint.key().as_ref(),token_amount.to_le_bytes().as_ref()],
        bump,//empty bump constraint,so anchor will find canonical bump itself
        token::mint = token_mint,
        token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub initializer_token: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        seeds = [b"escrow", initializer.key().as_ref()],
        bump,//empty bump constraint,so anchor will find canonical bump itself
        payer = initializer,
        space = Escrow::LEN + 1,//+1 for the bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub token_program: Program<'info, Token>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

//validation struct
#[derive(Accounts)]
#[instruction(token_amount: u64, vault_bump:u8)]
pub struct Accept<'info> {
    #[account(
        mut,
        seeds=[b"escrow", initializer.key().as_ref()],
        bump = escrow.escrow_bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        seeds = [b"vault", initializer.key().as_ref(), token_mint.key().as_ref(),token_amount.to_le_bytes().as_ref()],
        bump = vault_bump,
        close = initializer,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer= taker,
        associated_token::mint = token_mint,
        associated_token::authority = taker,
    )]
    pub taker_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub taker: Signer<'info>,
    #[account(mut)]
    pub initializer: AccountInfo<'info>,
    pub initializer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(address = system_program::ID)] //constraint to check the sys prog ID
    pub system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Token amount must be greater than zero.")]
    InvalidTokenAmount,
    #[msg("Price payed must be equal to price expected.")]
    InvalidPriceSent,
    #[msg("Incorrect PDA.")]
    InvalidProgramAddress,
    #[msg("Not the owner.")]
    InvalidAuthority,
}
