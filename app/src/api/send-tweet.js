import { web3 } from "@project-serum/anchor";
import { Tweet } from "@/models";

export const sendTweet = async ({ wallet, program }, topic, content) => {
  // Generate a new Keypair for our new tweet account. Each tweet is its own account.
  const tweet = web3.Keypair.generate();
  // Send a "SendTweet" instruction with the right data and the right accounts.
  await program.value.rpc.sendTweet(topic, content, {
    accounts: {
      author: wallet.value.publicKey,
      tweet: tweet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    },
    signers: [tweet],
  });

  const tweetAccount = await program.value.account.tweet.fetch(tweet.publicKey);

  return new Tweet(tweet.publicKey, tweetAccount);
};
