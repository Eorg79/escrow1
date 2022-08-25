import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Escrow1 } from "../target/types/escrow1";

describe("escrow1", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Escrow1 as Program<Escrow1>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
