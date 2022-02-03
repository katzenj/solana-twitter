import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { SolanaTwitter } from "../target/types/solana_twitter";
import * as assert from "assert";
import * as bs58 from "bs58";

describe("solana-twitter", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SolanaTwitter as Program<SolanaTwitter>;

  describe("creating tweets", () => {
    it("can send a new tweet", async () => {
      // Before sending the transaction to the blockchain.
      const tweet = anchor.web3.Keypair.generate();
      const topic = "bikes";
      const content = "this is a tweet about bikes";
      await program.rpc.sendTweet(topic, content, {
        accounts: {
          tweet: tweet.publicKey,
          author: program.provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [tweet],
      });
      // Fetch the account details of the created tweet.
      const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);
      assert.equal(
        tweetAccount.author.toBase58(),
        program.provider.wallet.publicKey.toBase58()
      );
      assert.equal(tweetAccount.topic, topic);
      assert.equal(tweetAccount.content, content);
      assert.ok(tweetAccount.timestamp);
    });

    it("can send a tweet with no topic", async () => {
      // Before sending the transaction to the blockchain.
      const tweet = anchor.web3.Keypair.generate();
      await program.rpc.sendTweet("", "this is a tweet", {
        accounts: {
          tweet: tweet.publicKey,
          author: program.provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [tweet],
      });
      // Fetch the account details of the created tweet.
      const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);
      assert.equal(
        tweetAccount.author.toBase58(),
        program.provider.wallet.publicKey.toBase58()
      );
      assert.equal(tweetAccount.topic, "");
      assert.equal(tweetAccount.content, "this is a tweet");
      assert.ok(tweetAccount.timestamp);
    });

    it("can send a new tweet from a different author", async () => {
      // Generate another user and airdrop them some SOL.
      const otherUser = anchor.web3.Keypair.generate();
      const signature = await program.provider.connection.requestAirdrop(
        otherUser.publicKey,
        1000000000
      );
      await program.provider.connection.confirmTransaction(signature);

      // Call the "SendTweet" instruction on behalf of this other user.
      const tweet = anchor.web3.Keypair.generate();
      await program.rpc.sendTweet("bikes", "team Cannondale", {
        accounts: {
          tweet: tweet.publicKey,
          author: otherUser.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [otherUser, tweet],
      });

      // Fetch the account details of the created tweet.
      const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);

      // Ensure it has the right data.
      assert.equal(
        tweetAccount.author.toBase58(),
        otherUser.publicKey.toBase58()
      );
      assert.equal(tweetAccount.topic, "bikes");
      assert.equal(tweetAccount.content, "team Cannondale");
      assert.ok(tweetAccount.timestamp);
    });

    it("cannot provide a topic with more than 50 characters", async () => {
      try {
        const tweet = anchor.web3.Keypair.generate();
        const topicWith51Chars = "x".repeat(51);
        await program.rpc.sendTweet(topicWith51Chars, "Bikes bikes bikes", {
          accounts: {
            tweet: tweet.publicKey,
            author: program.provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
          signers: [tweet],
        });
      } catch (error) {
        assert.equal(
          error.msg,
          "The provided topic should be 50 characters long maximum."
        );
        return;
      }

      assert.fail(
        "The instruction should have failed with a 51-character topic."
      );
    });

    it("cannot provide a content with more than 280 characters", async () => {
      try {
        const tweet = anchor.web3.Keypair.generate();
        const contentWith281Chars = "x".repeat(281);
        await program.rpc.sendTweet("bikes", contentWith281Chars, {
          accounts: {
            tweet: tweet.publicKey,
            author: program.provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
          signers: [tweet],
        });
      } catch (error) {
        assert.equal(
          error.msg,
          "The provided content should be 280 characters long maximum."
        );
        return;
      }

      assert.fail(
        "The instruction should have failed with a 281-character content."
      );
    });
  });

  describe("querying tweets", () => {
    it("can fetch all tweets", async () => {
      const tweetAccounts = await program.account.tweet.all();
      // The number three comes from the above tweets. It all runs on the local ledger,
      // so if the local ledger was previously running and had pre-existing state, or
      // if we added another test to create a tweet before this, this would fail.
      assert.equal(tweetAccounts.length, 3);
    });

    it("can filter tweets by author", async () => {
      const authorPublicKey = program.provider.wallet.publicKey;
      const tweetAccounts = await program.account.tweet.all([
        {
          memcmp: {
            offset: 8, // Discriminator.
            bytes: authorPublicKey.toBase58(),
          },
        },
      ]);

      assert.equal(tweetAccounts.length, 2);
      assert.ok(
        tweetAccounts.every((tweetAccount) => {
          return (
            tweetAccount.account.author.toBase58() ===
            authorPublicKey.toBase58()
          );
        })
      );
    });

    it("can filter tweets by topics", async () => {
      // The below offset can be compared with the Tweet LEN variable in our
      // rust program.
      const tweetAccounts = await program.account.tweet.all([
        {
          memcmp: {
            offset:
              8 + // Discriminator.
              32 + // Author public key.
              8 + // Timestamp.
              4, // Topic string prefix.
            bytes: bs58.encode(Buffer.from("bikes")),
          },
        },
      ]);

      assert.equal(tweetAccounts.length, 2);
      assert.ok(
        tweetAccounts.every((tweetAccount) => {
          return tweetAccount.account.topic === "bikes";
        })
      );
    });
  });

  describe("modifying tweets", () => {
    // Helper for updating tweets
    const sendTweet = async (author, topic, content) => {
      const tweet = anchor.web3.Keypair.generate();
      await program.rpc.sendTweet(topic, content, {
        accounts: {
          tweet: tweet.publicKey,
          author,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [tweet],
      });

      return tweet;
    };
    it("cannot update someone else's tweet", async () => {
      // 1. Send a tweet.
      const author = program.provider.wallet.publicKey;
      const tweet = await sendTweet(author, "solana", "Solana is awesome!");

      try {
        // 2. Try updating the Tweet.
        await program.rpc.updateTweet("eth", "Ethereum is awesome!", {
          accounts: {
            tweet: tweet.publicKey,
            author: anchor.web3.Keypair.generate().publicKey,
          },
        });

        // 3. Ensure updating the tweet did not succeed.
        assert.fail("We were able to update someone else's tweet.");
      } catch (error) {
        // 4. Ensure the tweet account kept its initial data.
        const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);
        assert.equal(tweetAccount.topic, "solana");
        assert.equal(tweetAccount.content, "Solana is awesome!");
      }
    });
    it("can update a tweet", async () => {
      const author = program.provider.wallet.publicKey;
      const tweet = await sendTweet(author, "web2", "Hello World!");
      const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);

      assert.equal(tweetAccount.topic, "web2");
      assert.equal(tweetAccount.content, "Hello World!");

      await program.rpc.updateTweet("solana", "gm everyone!", {
        accounts: {
          tweet: tweet.publicKey,
          author,
        },
      });

      const updatedTweetAccount = await program.account.tweet.fetch(
        tweet.publicKey
      );
      assert.equal(updatedTweetAccount.topic, "solana");
      assert.equal(updatedTweetAccount.content, "gm everyone!");
    });

    it("cannot update someone else's tweet", async () => {
      const author = program.provider.wallet.publicKey;
      const tweet = await sendTweet(author, "solana", "Solana is awesome!");

      try {
        await program.rpc.updateTweet("eth", "Ethereum is awesome!", {
          accounts: {
            tweet: tweet.publicKey,
            author: anchor.web3.Keypair.generate().publicKey,
          },
        });

        assert.fail("We were able to update someone else's tweet.");
      } catch (error) {
        const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);
        assert.equal(tweetAccount.topic, "solana");
        assert.equal(tweetAccount.content, "Solana is awesome!");
      }
    });

    it("can delete a tweet", async () => {
      const author = program.provider.wallet.publicKey;
      const tweet = await sendTweet(author, "solana", "gm");

      await program.rpc.deleteTweet({
        accounts: {
          tweet: tweet.publicKey,
          author,
        },
      });

      const tweetAccount = await program.account.tweet.fetchNullable(
        tweet.publicKey
      );
      assert.ok(tweetAccount === null);
    });

    it("cannot delete someone else's tweet", async () => {
      const author = program.provider.wallet.publicKey;
      const tweet = await sendTweet(author, "solana", "gm");

      try {
        await program.rpc.deleteTweet({
          accounts: {
            tweet: tweet.publicKey,
            author: anchor.web3.Keypair.generate().publicKey,
          },
        });
        assert.fail("We were able to delete someone else's tweet.");
      } catch (error) {
        const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);
        assert.equal(tweetAccount.topic, "solana");
        assert.equal(tweetAccount.content, "gm");
      }
    });
  });
});
