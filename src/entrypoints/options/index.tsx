import { createRoot } from 'react-dom/client';
import './index.scss';
// import '@/assets/globals.css';
import Options from './Options';
import Layout from './layout';

const container = document.getElementById('app');
const root = createRoot(container!);
root.render(
  <>
    <Layout>
      {/* <Options /> */}
      <span>Hello</span>
    </Layout>
  </>
);
