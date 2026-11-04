import { Component, useEffect, type ReactNode } from "react";
import { PrivyProvider, useConnectWallet, useWallets } from "@privy-io/react-auth";
import { portaldot } from "./chain";
import { PRIVY_APP_ID, privyMuted, publishPrivy, setPrivyMuted, setPrivyOpener } from "./privyBus";
import type { Eip1193 } from "./wallets";

/* Privy, for connecting external EVM wallets only (no email, no social, no embedded wallets). This module is a separate chunk,
   imported by main.tsx only when VITE_PRIVY_APP_ID is set. It publishes the connected wallet's EIP-1193 provider through
   privyBus; the existing wallet code keeps doing the signing, so the transaction flow is unchanged. */

function Bridge() {
  const { connectWallet } = useConnectWallet({
    onSuccess: () => setPrivyMuted(false), // an explicit connect lifts a previous PotKit disconnect
    onError: () => { /* closed or refused in the wallet: the app simply stays disconnected */ },
  });
  const { wallets, ready } = useWallets();

  useEffect(() => {
    setPrivyOpener(() => connectWallet({ walletChainType: "ethereum-only", description: "PotKit only asks for your address and the Portaldot V3 network." }));
    return () => setPrivyOpener(null);
  }, [connectWallet]);

  useEffect(() => {
    if (!ready) return;
    let dead = false;
    const w = privyMuted() ? undefined : wallets.find((x) => x.type === "ethereum");
    if (!w) { publishPrivy(null); return; }
    void w.getEthereumProvider().then((provider) => {
      if (dead) return;
      const icon = typeof w.meta.icon === "string" ? w.meta.icon : undefined;
      publishPrivy({ address: w.address, name: w.meta.name, id: w.meta.id, icon, provider: provider as unknown as Eip1193, disconnect: () => w.disconnect() });
    }).catch(() => { if (!dead) publishPrivy(null); });
    return () => { dead = true; };
  }, [ready, wallets]);
  return null;
}

/** If Privy cannot start (a wrong App ID, a blocked script), the app renders without it and keeps its own wallet picker. */
class PrivyGuard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { setPrivyOpener(null); publishPrivy(null); console.warn("Privy could not start; using the built-in wallet picker.", e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PrivyRoot({ children }: { children: ReactNode }) {
  return <PrivyGuard fallback={children}><PrivyInner>{children}</PrivyInner></PrivyGuard>;
}

function PrivyInner({ children }: { children: ReactNode }) {
  const dark = document.documentElement.dataset.theme !== "light";
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={{
      loginMethods: ["wallet"],
      appearance: {
        theme: dark ? "dark" : "light",
        accentColor: dark ? "#ECE7DD" : "#16233B",
        logo: "/potkit-p-circle-black.png",
        landingHeader: "Connect a wallet",
        showWalletLoginFirst: true,
        walletChainType: "ethereum-only",
        walletList: ["detected_ethereum_wallets", "metamask", "okx_wallet", "coinbase_wallet", "wallet_connect"],
      },
      defaultChain: portaldot,
      supportedChains: [portaldot],
    }}>
      <Bridge />
      {children}
    </PrivyProvider>
  );
}
