import clsx from 'clsx';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import DownloadLinks from '@site/src/components/DownloadLinks';

import Heading from '@theme/Heading';
import styles from './index.module.css';
import UserComments from '../components/UserComments';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className={styles.title}>
          {siteConfig.title}
        </Heading>
        <p className={styles.subTitle}><span className={styles.connect}>Connect</span> Browser and Logseq</p>
        <DownloadLinks />
      </div>
    </header>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="A bridge between logseq and browser, building your personal knowledge base easiey."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <UserComments />
      </main>
    </Layout>
  );
}
