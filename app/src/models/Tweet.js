export class Tweet {
  constructor(publicKey, accountData) {
    this.publicKey = publicKey;
    this.author = accountData.author;
    this.timestamp = accountData.timestamp.toString();
    this.topic = accountData.topic;
    this.content = accountData.content;
  }
}
