import { inject, provide, computed } from "vue";
import { useAnchorWallet } from "@solana/wallet-adapter-vue";
import { Connection, PublicKey } from "@solana/web3.js";
import { Provider, Program } from "@project-serum/anchor";

import idl from "@/idl/solana_twitter.json";

const workspaceSymbol = Symbol();
const programID = new PublicKey(idl.metadata.address);
const preflightCommitment = "processed";
const commitment = "processed";

export const useWorkspace = () => inject(workspaceSymbol);

export const initWorkspace = () => {
  const wallet = useAnchorWallet();
  const connection = new Connection(
    process.env.VUE_APP_CLUSTER_URL,
    commitment
  );
  const provider = computed(
    () => new Provider(connection, wallet.value, preflightCommitment)
  );
  const program = computed(() => new Program(idl, programID, provider.value));

  provide(workspaceSymbol, {
    wallet,
    connection,
    provider,
    program,
  });
};
