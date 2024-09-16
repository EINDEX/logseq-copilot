import styles from "./styles.module.css";
import Link from "@docusaurus/Link";

const Links = [
  {
    text: "Chrome",
    src: "/chrome.png",
    url: "https://chrome.google.com/webstore/detail/logseq-copilot/hihgfcgbmnbomabfdbajlbpnacndeihl",
  },
  {
    text: "Edge",
    src: "/edge.png",
    url: "https://microsoftedge.microsoft.com/addons/detail/logseq-copilot/ebigopegbohijaikegebaaboaomaifoi",
  },
  {
    text: "Firefox",
    src: "/firefox.png",
    url: "https://addons.mozilla.org/en-US/firefox/addon/logseq-copilot/",
  },
];

function DownloadLink({ src, text, url }) {
  return (
    <a
      className={"button button--secondary button--lg " + styles.button}
      data-umami-event="Chrome"
      href={url}
    >
      <img className={styles.icon} src={src} />
      Add to {text}
    </a>
  );
}

export default function DownloadLinks() {
  return (
    <div className={styles.buttons}>
      {Links.map((props, idx) => (
        <DownloadLink key={idx} {...props} />
      ))}
    </div>
  );
}
