import type { Metadata } from "next";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, AudioLines, BatteryMedium, Check, ChevronRight, Cpu, Github, Layers3, LockKeyhole, Maximize2, MousePointer2, SlidersHorizontal, SquareActivity, Terminal, Waves } from "lucide-react";
import release from "@/release.json";
import s from "./home.module.css";

const github = "https://github.com/Dreamtowards/Tracel";
export const metadata: Metadata = {
  title: "Tracel — 看见时间去了哪里",
  description: "在同一条可自由缩放的时间轴上，回看应用活动、窗口、CPU、GPU、音频与电池状态。下载 Windows 版 Tracel，或直接体验在线演示。",
  openGraph: { title: "Tracel — 看见时间去了哪里", description: "你的一天，电脑的状态，一条时间轴。", locale: "zh_CN", type: "website" },
};
function Mark() {
  return <svg width="27" height="27" viewBox="0 0 27 27" fill="none" aria-hidden="true"><rect x="1" y="1" width="25" height="25" rx="7" stroke="currentColor" strokeOpacity=".4" /><path d="M7 9H17M10 13.5H20M7 18H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M18 6V21" stroke="currentColor" strokeOpacity=".4" /></svg>;
}
function Download() {
  return <a className={s.downloadButton} href={release.url}><ArrowDownToLine size={17} />下载 Windows 版</a>;
}
const sources = [
  { icon: Layers3, name: "应用与窗口", details: "前台应用 · 窗口标题 · 桌面应用存在状态 · 空闲时段", color: "#b8a2dc" },
  { icon: Cpu, name: "系统与性能", details: "CPU 与频率 · RAM · GPU 与引擎 · 专用 / 共享显存", color: "#83b8c5" },
  { icon: Waves, name: "网络与磁盘", details: "物理网络收发速率 · 物理磁盘读写速率", color: "#bca2ce" },
  { icon: AudioLines, name: "音频与媒体", details: "麦克风电平 · 输出电平 · 媒体标题 · 播放与暂停", color: "#a6b5d0" },
  { icon: BatteryMedium, name: "电池与供电", details: "电量百分比 · 插电状态 · 充电状态", color: "#d1b781" },
];
const faqs = [
  ["需要安装吗？支持哪些系统？", <>下载 Windows x64 的 EXE 后直接运行，无需安装器。需要 Microsoft Edge WebView2 Runtime；如果电脑中没有，请先从 <a href="https://developer.microsoft.com/en-us/microsoft-edge/webview2/">Microsoft 官网</a>安装。当前没有 macOS、Linux 或移动版。</>],
  ["数据会上传吗？可以关闭采集吗？", <>桌面活动记录保存在本机，不需要账号，也没有活动数据的云端上传。首次启动默认关闭采集；右键轨道表头可控制总开关和各类来源。窗口标题可能包含文档名称，请按需要选择是否记录。</>],
  ["关闭客户端以后，还会继续记录吗？", <>当前退出客户端就会停止采集，已保存的历史保留。独立后台服务和自动启动还未实现。</>],
  ["时间轴可以放得多大？数据有多精确？", <>支持连续缩放，最小可见范围约两秒；常规采集间隔约两秒，放大不会补出采样之间的事件。原生历史目前按天加载；在线演示可以浏览多天示例数据。</>],
  ["能记录浏览器网址、所有后台程序吗？", <>当前记录前台窗口标题，不提取浏览器 URL 或文件内容。应用存在状态覆盖带桌面窗口的应用，包括最小化窗口，并不是完整的后台进程或服务清单。媒体信息和 GPU 指标取决于应用和系统驱动的支持。</>],
] as const;

export default function Home() {
  return <div className={s.site}>
    <a className={s.skip} href="#main">跳到主要内容</a>
    <header className={s.header}>
      <a className={s.brand} href="/" aria-label="Tracel 首页"><Mark /><span>Tracel</span></a>
      <nav aria-label="主导航"><a href="#features">功能</a><a href="#compare">为什么选 Tracel</a><a href="/timeline">在线演示</a><a href={github} aria-label="GitHub 仓库"><Github size={18} /><span>GitHub</span></a></nav>
      <a href="#download" className={s.navDownload}>下载<ArrowDownToLine size={14} /></a>
    </header>
    <main id="main">
      <section className={`${s.hero} ${s.container}`} aria-labelledby="hero-title">
        <div className={s.heroText}>
          <div><p className={s.eyebrow}><i />YOUR DAY, IN FOCUS</p><h1 id="hero-title">看见时间<br /><span>去了哪里。</span></h1></div>
          <div className={s.heroIntro}><p>你的一天，电脑的状态，<br />一条时间轴。</p><p className={s.description}>把应用、窗口、系统性能和媒体状态放在一起。<br />回看发生过的事情，找回对时间的掌控感。</p><div className={s.actions}><Download /><a href="/timeline">在线体验<ArrowRight size={16} /></a></div><p className={s.releaseNote}>v{release.version}<span>·</span>Windows x64<span>·</span>本地存储</p></div>
        </div>
        <figure className={s.product}>
          <div className={s.productBar}><span><SquareActivity size={14} />TRACEL / ACTIVITY & PERFORMANCE</span><span>真实界面 · 示例数据</span></div>
          {/* A local image keeps static export independent of image-optimization services. */}
          <img src="/images/tracel-timeline.webp" width={3031} height={1677} alt="Tracel 桌面界面：前台应用、窗口上下文与系统性能沿时间对齐，右侧显示范围分析。图中为示例数据。" fetchPriority="high" />
          <figcaption><span>从「今天做了什么」，到「那几分钟发生了什么」。</span><a href="/timeline">自己探索一下<ChevronRight size={14} /></a></figcaption>
        </figure>
        <div className={s.principles}><span><LockKeyhole size={15} />记录留在你的电脑</span><span><SlidersHorizontal size={15} />每类采集独立开关</span><span><MousePointer2 size={15} />选中一段，即刻分析</span><a href="#why">为什么做它<ArrowDown size={14} /></a></div>
      </section>

      <section id="why" className={`${s.section} ${s.container} ${s.split}`} aria-labelledby="why-title">
        <div><p className={s.eyebrow}>01 / A CLEARER DAY</p><h2 id="why-title">一天过去了，<br />也想知道它是怎么过去的。</h2></div>
        <div className={s.whyCopy}><p>写代码、查资料、切换窗口，抬头时几个小时已经过去。日历记录了计划，Tracel 帮你回看实际发生的事情。</p><p>它最初来自一个简单的愿望：把一天展开，看到时间花在哪里。也许能发现一个习惯，也许只是看见今天的努力，就已经很满足。</p><aside>给重度电脑使用者，也给喜欢追踪时间的你。</aside></div>
      </section>

      <section id="features" className={`${s.section} ${s.container}`} aria-labelledby="features-title">
        <div className={s.sectionHeading}><div><p className={s.eyebrow}>02 / EXPLORE YOUR TIME</p><h2 id="features-title">让线索，出现在同一个时间位置。</h2></div><a className={s.textLink} href="/timeline">打开交互演示<ArrowUpRight size={14} /></a></div>
        <div className={s.featureGrid}>
          <article className={s.feature}><Layers3 size={21} /><h3>一条时间轴，更多上下文</h3><p>应用、窗口、性能和播放状态沿时间对齐。展开应用看上下文，展开 GPU 看引擎，把分散的线索放在一起。</p><div className={s.miniLanes} aria-hidden="true"><div><span>Code</span><i style={{ left: "25%", width: "40%", background: "#a99bc5" }} /><i style={{ left: "78%", width: "20%", background: "#a99bc5" }} /></div><div><span>Browser</span><i style={{ left: "65%", width: "13%", background: "#8da9b8" }} /></div><div><span>CPU</span><svg viewBox="0 0 220 35" preserveAspectRatio="none"><path d="M0 30L12 27L21 29L35 23L43 26L51 6L61 8L70 2L79 20L91 25L106 20L120 26L130 12L141 18L150 9L161 29L175 22L189 27L205 19L220 24" /></svg></div></div></article>
          <article className={s.feature}><Maximize2 size={21} /><h3>从一天，到几秒钟</h3><p>连续缩放、平移，自己决定看多大的范围、追到多细。原生历史按天查看，放大后仍保留真实的采样边界。</p><div className={s.zoomIllustration} aria-hidden="true"><div><span>一天</span><span>一小时</span><span>几秒钟</span></div><div className={s.zoomLine}>{Array.from({length:13},(_,i)=><i key={i} />)}</div><p><Maximize2 size={14} />细节，由你决定</p></div></article>
          <article className={s.feature}><MousePointer2 size={21} /><h3>选中一段，就分析这一段</h3><p>拖选一个区间，查看应用与分类排行、性能统计、媒体记录。没有选区时，就分析当前可见的时间范围。</p><div className={s.miniStats}><div><span>Visual Studio Code</span><span>56%</span></div><i style={{ width: "56%" }} /><div><span>Microsoft Edge</span><span>28%</span></div><i style={{ width: "28%", background: "#8da9b8" }} /><small>示意数据 · 随选择范围更新</small></div></article>
        </div>
        <div className={s.analysisShowcase}><div><span className={s.detailLabel}>SELECT → UNDERSTAND</span><h3>把一个下午，<br />变成可以回答的问题。</h3><p>那段时间在用什么应用？机器什么时候忙起来？听了什么？选中感兴趣的一段，沿着线索回头看看。</p><a className={s.textLink} href="/timeline">试试拖选时间段<ArrowRight size={16} /></a></div><figure><img src="/images/tracel-selection.png" width={1600} height={1100} loading="lazy" alt="使用示例数据演示时间轴选区，右侧分析随选定范围更新。" /><figcaption>真实桌面界面 · 使用示例数据展示选区分析</figcaption></figure></div>
      </section>

      <section id="sources" className={`${s.section} ${s.container}`} aria-labelledby="sources-title">
        <div className={s.sectionHeading}><div><p className={s.eyebrow}>03 / YOUR COMPUTER, IN CONTEXT</p><h2 id="sources-title">记录什么，由你决定。</h2></div><p>右键点击轨道表头，开启需要的采集。<br />关闭只影响新数据，已有历史继续保留。</p></div>
        <div className={s.sourcesGrid}><div className={s.sourceList}>{sources.map(({ icon: Icon, name, details, color }) => <div className={s.sourceRow} key={name}><Icon size={20} style={{ color }} /><div><h3>{name}</h3><p>{details}</p></div><Check size={15} /></div>)}</div><figure className={s.collectionShot}><div><SlidersHorizontal size={16} />右键表头 → 采集</div><img src="/images/tracel-collection.png" width={228} height={595} loading="lazy" alt="Tracel 右键采集菜单，包含总开关，以及应用、系统性能、音频和媒体的独立开关。" /><figcaption>真实菜单 · 示例开关状态</figcaption></figure></div>
        <div className={s.sourceNotes}><p><LockKeyhole size={16} /><span><strong>本地优先。</strong>记录保存在电脑上的 SQLite 数据库，可导出 JSON。</span></p><p><AudioLines size={16} /><span><strong>记录电平，不录音。</strong>不会保存麦克风或扬声器的音频内容。</span></p><p><Terminal size={16} /><span><strong>基础采集直接可用。</strong>应用、窗口和系统指标无需为被记录的软件安装插件。</span></p></div>
      </section>

      <section id="compare" className={`${s.section} ${s.container}`} aria-labelledby="compare-title">
        <div className={s.sectionHeading}><div><p className={s.eyebrow}>04 / A DIFFERENT VIEW</p><h2 id="compare-title">把时间记录和状态回看，放在一起。</h2></div><p>不同工具，各有擅长。<br />Tracel 选择把它们连接起来。</p></div>
        <div className={s.comparisonScroll} tabIndex={0} role="region" aria-label="工具设计取向比较，可横向滚动"><table className={s.comparison}><thead><tr><th scope="col">你想了解什么</th><th scope="col">ActivityWatch</th><th scope="col">任务管理器的性能页</th><th scope="col"><span><Mark />Tracel</span></th></tr></thead><tbody><tr><th scope="row">关注的重点</th><td>设备使用时间与活动分析</td><td>当前资源与进程状态</td><td>活动与性能的历史时间轴</td></tr><tr><th scope="row">活动和系统性能</th><td>默认窗口 / AFK，可扩展采集</td><td>实时 CPU、内存、GPU 等</td><td>多类采集内置，同一时间坐标</td></tr><tr><th scope="row">探索一段过去的时间</th><td>活动报表与时间轴</td><td>侧重实时与近期性能</td><td>缩放、平移、选区联动分析</td></tr><tr><th scope="row">适合怎样的需求</th><td>时间追踪与扩展生态</td><td>观察当前状态、排查进程</td><td>回看一天、对照多种线索</td></tr></tbody></table></div>
        <p className={s.comparisonNote}>这是设计取向的比较，不是完整功能清单。ActivityWatch 也有默认分类、浏览器与编辑器扩展，以及系统资源社区采集器。<a href="https://docs.activitywatch.net/en/latest/watchers.html">查看官方采集器文档<ArrowUpRight size={12} /></a></p>
      </section>

      <section className={`${s.section} ${s.container} ${s.faq}`} aria-labelledby="faq-title"><div><p className={s.eyebrow}>GOOD TO KNOW</p><h2 id="faq-title">开始之前。</h2><p>目前是持续开发中的 Windows 桌面应用。</p></div><div className={s.questions}>{faqs.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

      <section id="download" className={`${s.download} ${s.container}`} aria-labelledby="download-title"><div><p className={s.eyebrow}>START WITH TODAY</p><h2 id="download-title">让今天，留下清晰的轨迹。</h2><p>从打开第一条轨道开始。</p></div><div className={s.downloadActions}><Download /><p>v{release.version} · Windows x64 · {(release.bytes / 1000000).toFixed(1)} MB</p><div><a href={github}><Github size={14} />查看源码</a><a href={release.url.replace(/\.exe$/, ".sha256")}>SHA-256</a></div><small>开发中版本 · 发布于 {release.date}{release.visibility === "private" && " · 下载需要 GitHub 仓库访问权限"}</small></div></section>
    </main>
    <footer className={`${s.footer} ${s.container}`}><a className={s.brand} href="/"><Mark /><span>Tracel</span></a><span>你的一天，值得回看。</span><nav aria-label="页脚导航"><a href={github}>GitHub</a><a href="/timeline">时间轴演示</a><a href="/radar">Radar 实验</a></nav></footer>
  </div>;
}
