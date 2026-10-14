import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Explorer, type RangeExport } from "@tracel/timeline";
import { demoProvider } from "@tracel/timeline/mock";
import { getAppInfo, nativeClient, saveRange, type AppInfo } from "./native";

class ClientBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <main className="desktop-recovery">
        <h1>Let’s reopen your timeline.</h1>
        <p>The view could not be displayed. Your exported files are unaffected.</p>
        <button onClick={() => window.location.reload()}>Reload client</button>
      </main>
    );
    return this.props.children;
  }
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [notice, setNotice] = useState("");
  const about = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!nativeClient) return;
    let active = true;
    getAppInfo().then((result) => { if (active) setInfo(result); })
      .catch(() => { if (active) setInfoError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const exportRange = async (payload: RangeExport) => {
    setNotice("");
    const outcome = await saveRange(payload);
    setNotice(outcome === "saved" ? "Timeline range saved to your chosen file." : "Export cancelled. No file was written.");
  };
  return (
    <ClientBoundary>
      <Explorer
        provider={demoProvider}
        homeHref="/"
        localDataLabel="All data stays on this device"
        machineLabel={info ? `${info.deviceName} / ${info.platform === "windows" ? "Windows" : info.platform}` : nativeClient ? "This device" : "Desktop preview"}
        headerActions={<button className="desktop-about-button" onClick={() => about.current?.showModal()}>About client</button>}
        onExport={nativeClient ? exportRange : undefined}
      />
      <div className="desktop-notice" role="status" aria-live="polite">{notice}</div>
      <dialog ref={about} className="desktop-about" onClick={(event) => { if (event.target === event.currentTarget) about.current?.close(); }}>
        <div className="desktop-about-heading"><span>TRACEL / ACTIVITY</span><button aria-label="Close about client" onClick={() => about.current?.close()}>×</button></div>
        <h1>Your computer, in context.</h1>
        <p>A local timeline for activity and system performance.</p>
        <dl>
          <div><dt>Client</dt><dd>{nativeClient ? "Windows desktop" : "Browser preview"}{info ? ` · ${info.version}` : ""}</dd></div>
          <div><dt>Data source</dt><dd>Demo capture · October 8–14, 2026</dd></div>
          <div><dt>Collection</dt><dd>Not running · no native collector yet</dd></div>
          <div><dt>Export</dt><dd>{nativeClient ? "JSON · choose a file on this device" : "JSON · browser download"}</dd></div>
        </dl>
        <p className="desktop-about-detail">Explore, select and compare the included capture. This version does not read your app activity, record audio or upload data. Closing the window exits the client.</p>
        {infoError && <p role="status">Device information is unavailable. The demo remains available.</p>}
        <form method="dialog"><button autoFocus>Back to timeline</button></form>
      </dialog>
    </ClientBoundary>
  );
}
