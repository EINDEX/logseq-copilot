abstract class SearchingEngine {
  isMatch(): boolean {
    return false;
  }
  getQuery(): string | null {
    return null;
  }
  gotElement(): Element | null {
    return null;
  }
  reload(callback: Function): null {
    return null;
  }
}

export class Google extends SearchingEngine {
  // .google.com .google.ad .google.ae .google.com.af .google.com.ag .google.com.ai .google.al .google.am .google.co.ao .google.com.ar .google.as .google.at .google.com.au .google.az .google.ba .google.com.bd .google.be .google.bf .google.bg .google.com.bh .google.bi .google.bj .google.com.bn .google.com.bo .google.com.br .google.bs .google.bt .google.co.bw .google.by .google.com.bz .google.ca .google.cd .google.cf .google.cg .google.ch .google.ci .google.co.ck .google.cl .google.cm .google.cn .google.com.co .google.co.cr .google.com.cu .google.cv .google.com.cy .google.cz .google.de .google.dj .google.dk .google.dm .google.com.do .google.dz .google.com.ec .google.ee .google.com.eg .google.es .google.com.et .google.fi .google.com.fj .google.fm .google.fr .google.ga .google.ge .google.gg .google.com.gh .google.com.gi .google.gl .google.gm .google.gr .google.com.gt .google.gy .google.com.hk .google.hn .google.hr .google.ht .google.hu .google.co.id .google.ie .google.co.il .google.im .google.co.in .google.iq .google.is .google.it .google.je .google.com.jm .google.jo .google.co.jp .google.co.ke .google.com.kh .google.ki .google.kg .google.co.kr .google.com.kw .google.kz .google.la .google.com.lb .google.li .google.lk .google.co.ls .google.lt .google.lu .google.lv .google.com.ly .google.co.ma .google.md .google.me .google.mg .google.mk .google.ml .google.com.mm .google.mn .google.ms .google.com.mt .google.mu .google.mv .google.mw .google.com.mx .google.com.my .google.co.mz .google.com.na .google.com.ng .google.com.ni .google.ne .google.nl .google.no .google.com.np .google.nr .google.nu .google.co.nz .google.com.om .google.com.pa .google.com.pe .google.com.pg .google.com.ph .google.com.pk .google.pl .google.pn .google.com.pr .google.ps .google.pt .google.com.py .google.com.qa .google.ro .google.ru .google.rw .google.com.sa .google.com.sb .google.sc .google.se .google.com.sg .google.sh .google.si .google.sk .google.com.sl .google.sn .google.so .google.sm .google.sr .google.st .google.com.sv .google.td .google.tg .google.co.th .google.com.tj .google.tl .google.tm .google.tn .google.to .google.com.tr .google.tt .google.com.tw .google.co.tz .google.com.ua .google.co.ug .google.co.uk .google.com.uy .google.co.uz .google.com.vc .google.co.ve .google.vg .google.co.vi .google.com.vn .google.vu .google.ws .google.rs .google.co.za .google.co.zm .google.co.zw .google.cat
  isMatch(): boolean {
    const match = window.location.hostname.match(
      /\.google(\.com?)?(\.\w{2})?(\.cat)?$/g,
    );
    return !!match;
  }

  getQuery(): string | null {
    const searchURL = new URL(window.location.href);
    const query = searchURL.searchParams.get('q');
    return query;
  }

  gotElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.getElementById('rhs');

    const hasAside = !!asideElement;

    if (hasAside) {
      asideElement.insertBefore(container, asideElement.firstChild);
    } else {
      const noAsideElement = document.getElementById('rcnt');
      noAsideElement!.appendChild(container);
      container.id = 'rhs';
    }
    return container;
  }
}

export class Ecosia extends SearchingEngine {
  isMatch(): boolean {
    const match = window.location.hostname.match(/ecosia\.org$/g);
    return !!match;
  }

  getQuery(): string | null {
    const searchURL = new URL(window.location.href);
    const query = searchURL.searchParams.get('q');
    return query;
  }

  gotElement(): Element {
    const container = document.createElement('article');
    const asideElement = document.querySelector('.sidebar .web__sidebar');
    asideElement!.insertBefore(container, asideElement!.firstChild);
    
    return container;
  }
}

export class Bing extends SearchingEngine {
  isMatch(): boolean {
    const match = window.location.hostname.match(/bing(\.com)?(\.\w{2})?$/g);
    return !!match;
  }

  getQuery(): string | null {
    const searchURL = new URL(window.location.href);
    const query = searchURL.searchParams.get('q');
    return query;
  }

  gotElement(): Element {
    const container = document.createElement('li');
    const asideElement = document.querySelector('#b_context');
    console.log(asideElement);
    container.className = 'b_ans';

    asideElement!.insertBefore(container, asideElement!.firstChild);
    return container;
  }
}

export class DuckDuckGo extends SearchingEngine {
  isMatch(): boolean {
    const match = window.location.hostname.match(/duckduckgo\.com$/g);
    return !!match;
  }

  getQuery(): string | null {
    const searchURL = new URL(window.location.href);
    const query = searchURL.searchParams.get('q');
    return query;
  }

  gotElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.getElementsByClassName('js-react-sidebar')[0];

    container.style.marginLeft = '8px';

    asideElement!.insertBefore(container, asideElement!.firstChild);
    return container;
  }
}

export class Yandex extends SearchingEngine {
  isMatch(): boolean {
    const match = window.location.hostname.match(/yandex\.(com|ru)$/);
    return !!match;
  }

  getQuery(): string | null {
    const searchURL = new URL(window.location.href);
    const query = searchURL.searchParams.get('text');
    return query;
  }

  gotElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.querySelector('#search-result-aside');

    asideElement!.insertBefore(container, asideElement!.firstChild);
    return container;
  }
}

export class SearX extends SearchingEngine {
  isMatch(): boolean {
    // Check if the website is using the searx engine
    const meta = document.querySelector('head > meta[name="generator"]');
    if (meta && meta.getAttribute('content')?.includes('searxng')) {
      return true;
    }
    // Check if the website is using the searx engine
    const match = !!window.location.hostname.match(/^searx(ng)?\./);
    return !!match;
  }

  getQuery(): string | null {
    const searchUrlDom = document.getElementById('search_url');
    if (searchUrlDom) {
      const searchUrl = new URL(
        searchUrlDom.getElementsByTagName('pre')[0].innerText,
      );
      return searchUrl.searchParams.get('q');
    }

    const searchUrl = new URL(window.location.href);
    const query = searchUrl.searchParams.get('q');

    return query;
  }

  gotElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.getElementById('sidebar');

    asideElement!.insertBefore(container, asideElement!.firstChild);
    return container;
  }
}

export class Baidu extends SearchingEngine {
  isMatch(): boolean {
    // Check if the website is using the searx engine
    const match = !!window.location.hostname.match('baidu.com');
    return !!match;
  }

  getQuery(): string | null {
    const searchUrl = new URL(window.location.href);
    const query = searchUrl.searchParams.get('wd');

    return query;
  }

  gotElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.querySelector('#con-ar');
    asideElement!.insertBefore(container, asideElement!.firstChild);
    return container;
  }

  reload(callback: Function): null {
    const targetNode = document.getElementById('wrapper_wrapper')!;
    const observer = new MutationObserver(function (records) {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if ('id' in node && node.id === 'container') {
              callback();
              return null;
            }
          }
        }
      }
    });
    observer.observe(targetNode, { childList: true });
    return null;
  }
}
export class Kagi extends SearchingEngine {
  isMatch(): boolean {
    const match = window.location.hostname.match(/kagi\.com$/g);
    return !!match;
  }

  getQuery(): string | null {
    const searchUrl = new URL(window.location.href);
    const query = searchUrl.searchParams.get('q');

    return query;
  }

  gotElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.querySelector('div.right-content-box');

    asideElement!.insertBefore(container, asideElement!.firstChild);
    return container;
  }
}
export class Startpage extends SearchingEngine {
  isMatch(): boolean {
    const match = window.location.hostname.match(/startpage\.com$/g);
    return !!match;
  }

  getQuery(): string | null {
    const query = document.querySelector('#q')?.getAttribute('value') || null;
    return query;
  }

  gotElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.querySelector(
      'div.layout-web__sidebar.layout-web__sidebar--web',
    );

    asideElement!.insertBefore(container, asideElement!.firstChild);
    return container;
  }
}

const searchEngins = [
  new Google(),
  new Ecosia(),
  new Bing(),
  new DuckDuckGo(),
  new Yandex(),
  new SearX(),
  new Kagi(),
  new Baidu(),
  new Startpage(),
];

export default searchEngins;
