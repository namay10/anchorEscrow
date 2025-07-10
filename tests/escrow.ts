import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Escrow } from "../target/types/escrow";
import { it } from "mocha";

describe("escrow", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const program = anchor.workspace.escrow as Program<Escrow>;

  const seed = new BN(10);
  const maker = Keypair.generate();
  let mint_a: PublicKey;
  let mint_b: PublicKey;
  let maker_ata_a: PublicKey;
  let maker_ata_b: PublicKey;
  let escrowPda: PublicKey;
  let vault_ata: PublicKey;

  const receive = new BN(2001);
  const bump = new BN(12);
  const deposit = new BN(200);
  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        maker.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    mint_a = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      6
    );
    mint_b = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      6
    );
    maker_ata_a = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        maker,
        mint_a,
        maker.publicKey
      )
    ).address;
    maker_ata_b = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        maker,
        mint_b,
        maker.publicKey
      )
    ).address;
    await mintTo(provider.connection, maker, mint_a, maker_ata_a, maker, 3000);
    await mintTo(provider.connection, maker, mint_b, maker_ata_b, maker, 3000);
    [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    vault_ata = getAssociatedTokenAddressSync(mint_a, escrowPda, true);
  });

  it("Is initialized!", async () => {
    // Add your test here.
    try {
      const tx = await program.methods
        .make(seed, receive, deposit)
        .accountsPartial({
          maker: maker.publicKey,
          mintA: mint_a,
          mintB: mint_b,
          makerAtaA: maker_ata_a,
          escrow: escrowPda,
          vault: vault_ata,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();
      console.log("Your transaction signature", tx);
    } catch (error) {
      console.log("error", error);
    }
  });

  it("Escrow refund", async () => {
    try {
      const tx = await program.methods
        .refund()
        .accountsPartial({
          escrow: escrowPda,
          maker: maker.publicKey,
          mintA: mint_a,
          makerAtaA: maker_ata_a,
          vault: vault_ata,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();
      console.log("Refund transaction signature", tx);
    } catch (error) {
      console.log("error", error);
    }
  });

  it("take test", async () => {
    const taker = Keypair.generate();
    const newSeed = new BN(20); // Different seed for new escrow
    const [newEscrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        newSeed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const newVaultAta = getAssociatedTokenAddressSync(
      mint_a,
      newEscrowPda,
      true
    );

    // Airdrop SOL to taker
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        taker.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );

    const taker_ata_a = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        taker,
        mint_a,
        taker.publicKey
      )
    ).address;
    const taker_ata_b = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        taker,
        mint_b,
        taker.publicKey
      )
    ).address;

    // Mint tokens to taker's account B
    await mintTo(provider.connection, maker, mint_b, taker_ata_b, maker, 3000);

    await program.methods
      .make(newSeed, receive, deposit)
      .accountsPartial({
        maker: maker.publicKey,
        mintA: mint_a,
        mintB: mint_b,
        makerAtaA: maker_ata_a,
        escrow: newEscrowPda,
        vault: newVaultAta,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    await program.methods
      .take()
      .accountsPartial({
        maker: maker.publicKey,
        taker: taker.publicKey,
        mintA: mint_a,
        mintB: mint_b,
        takerAtaA: taker_ata_a,
        takerAtaB: taker_ata_b,
        makerAtaB: maker_ata_b,
        escrow: newEscrowPda,
        vault: newVaultAta,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();
  });
});
