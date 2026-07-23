const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// 통신/네트워크 핵심 키워드 그룹 (구체적으로)
const KEYWORD_GROUPS = [
  '5G RAN packet core',
  '5G core network slicing',
  'O-RAN open radio access network',
  'network function virtualization NFV telecom',
  'software defined networking SDN 5G',
  'evolved packet gateway EPC mobile',
  '5GC service based architecture',
  'Ericsson 5G network',
  'user plane function packet forwarding',
  'UPF gateway data plane',
  'distributed routing mobile core',
  'packet processing forwarding engine',
  'network automation orchestration telecom',
  'containerized network function microservice',
  'traffic engineering load balancing 5G',
  'service mesh telco cloud',
  'LTE-R railway communication FRMCS',
  'private 5G industrial network',
  'mission critical communication PTT',
  'maritime ship communication LTE',
  '5G URLLC industrial automation',
  '6G terahertz THz communication',
  '6G reconfigurable intelligent surface RIS',
  '6G AI native network',
  '6G holographic MIMO sensing',
  '6G non-terrestrial network NTN satellite'
];

// 투자 섹터별 키워드 그룹 (mode=invest용)
const INVEST_KEYWORD_GROUPS = {
  '반도체': [
    'advanced semiconductor fabrication EUV lithography',
    'chiplet heterogeneous integration packaging',
    'GAA gate all around transistor 2nm',
    'high bandwidth memory HBM AI accelerator',
    'neuromorphic computing chip architecture'
  ],
  '미국나스닥': [
    'large language model GPT transformer scaling',
    'generative AI enterprise application',
    'AI agent autonomous reasoning',
    'multimodal foundation model vision language',
    'edge AI inference optimization deployment'
  ],
  '배터리': [
    'solid state battery electrolyte ionic conductivity',
    'lithium sulfur battery energy density',
    'sodium ion battery commercial viability',
    'battery recycling closed loop material recovery',
    'silicon anode high capacity lithium battery'
  ],
  '자동차': [
    'autonomous driving perception planning L4',
    'vehicle to everything V2X cooperative driving',
    'electric vehicle thermal management battery',
    'lidar sensor fusion self driving',
    'hydrogen fuel cell vehicle commercial'
  ],
  '바이오': [
    'mRNA therapeutic cancer vaccine',
    'CRISPR gene editing clinical trial',
    'AI drug discovery molecular generation',
    'cell therapy CAR-T solid tumor',
    'digital health wearable diagnostics'
  ],
  '클린에너지': [
    'perovskite solar cell efficiency stability',
    'green hydrogen electrolysis PEM',
    'offshore wind floating platform',
    'carbon capture utilization storage CCUS',
    'grid scale energy storage vanadium redox'
  ],
  'AI/로봇': [
    'humanoid robot manipulation dexterous',
    'reinforcement learning robotics sim to real',
    'embodied AI physical world interaction',
    'collaborative robot cobot manufacturing',
    'computer vision object detection real time'
  ]
};

// 산업 영향도 판단 키워드 (논문이 실제 산업에 영향을 미칠 가능성)
const INDUSTRY_IMPACT_KEYWORDS = {
  high_impact: [
    'commercial', 'mass production', 'scalable', 'deployment', 'manufacturing',
    'cost reduction', 'industry', 'product', 'market', 'pilot', 'prototype',
    'fab', 'foundry', 'supply chain', 'revenue', 'shipment', 'customer',
    'patent', 'licensing', 'standard', 'regulation', 'FDA', 'approval',
    'gigafactory', 'capacity', 'yield', 'throughput', 'efficiency'
  ],
  medium_impact: [
    'practical', 'feasible', 'demonstration', 'real-world', 'benchmark',
    'performance', 'state-of-the-art', 'breakthrough', 'novel', 'improved',
    'optimization', 'outperform', 'validated', 'experimental', 'implemented'
  ],
  low_impact: [
    'theoretical', 'simulation', 'proposed', 'framework', 'survey',
    'review', 'future work', 'preliminary', 'hypothesis', 'model'
  ]
};

// 논문의 산업 영향도 점수 계산
function calcIndustryImpact(title, abstract, keywords) {
  var text = ((title || '') + ' ' + (abstract || '') + ' ' + (keywords || []).join(' ')).toLowerCase();
  var highCount = 0, medCount = 0, lowCount = 0;

  for (var i = 0; i < INDUSTRY_IMPACT_KEYWORDS.high_impact.length; i++) {
    if (text.includes(INDUSTRY_IMPACT_KEYWORDS.high_impact[i])) highCount++;
  }
  for (var i = 0; i < INDUSTRY_IMPACT_KEYWORDS.medium_impact.length; i++) {
    if (text.includes(INDUSTRY_IMPACT_KEYWORDS.medium_impact[i])) medCount++;
  }
  for (var i = 0; i < INDUSTRY_IMPACT_KEYWORDS.low_impact.length; i++) {
    if (text.includes(INDUSTRY_IMPACT_KEYWORDS.low_impact[i])) lowCount++;
  }

  // 산업 영향도 점수: high 3점, medium 1점, low -0.5점
  var impactScore = highCount * 3 + medCount * 1 - lowCount * 0.5;
  var level = 'low';
  if (impactScore >= 10) level = 'high';
  else if (impactScore >= 5) level = 'medium';

  return { score: Math.round(impactScore * 10) / 10, level: level, high: highCount, medium: medCount, low: lowCount };
}

function getWeekRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days || 7));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function invertedIndexToText(idx) {
  if (!idx) return '';
  const words = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.join(' ');
}

// 통신 관련성 점수 계산
const RELEVANCE_TERMS = [
  // core telecom
  '5g', '6g', 'open ran', 'o-ran', 'oran', 'packet core', 'network slicing',
  'nfv', 'sdn', 'telecom', 'mobile network', 'cellular',
  'base station', 'gnodeb', 'radio access', 'ran',
  // core network functions
  'upf', 'amf', 'smf', 'nrf', 'nssf', 'ausf', 'udm',
  'epg', 'pgw', 'sgw', 'mme', 'core network', 'network function',
  // packet forwarding & data plane
  'packet forwarding', 'forwarding engine', 'data plane', 'user plane',
  'fast path', 'dpdk', 'xdp', 'ebpf', 'vpp', 'fd.io',
  'gtp', 'gtp-u', 'tunnel', 'encapsulation',
  // routing & distributed
  'routing', 'distributed', 'load balancing', 'traffic engineering',
  'service chaining', 'service mesh', 'proxy',
  'segment routing', 'srv6', 'mpls',
  // virtualization & cloud native
  'virtualization', 'containerized', 'microservice', 'kubernetes',
  'cloud native', 'vnf', 'cnf', 'orchestration', 'helm',
  // radio & physical
  'mimo', 'beamforming', 'carrier aggregation', 'lte',
  'fronthaul', 'backhaul', 'midhaul', 'spectrum',
  // vendors & standards
  'ericsson', 'nokia', 'huawei', '3gpp', 'etsi',
  // automation & intelligence
  'network automation', 'intent based', 'self healing', 'nwdaf',
  'mec', 'edge computing',
  // industrial & vertical
  'lte-r', 'frmcs', 'railway', 'train communication',
  'private network', 'private 5g', 'industrial iot', 'iiot',
  'urllc', 'mission critical', 'push to talk',
  'maritime', 'v2x', 'vehicle to everything',
  'smart factory', 'industry 4.0', 'tsn', 'time sensitive',
  // 6G
  '6g', 'terahertz', 'thz', 'reconfigurable intelligent surface', 'ris',
  'holographic mimo', 'ai native', 'non-terrestrial network', 'ntn',
  'integrated sensing', 'isac', 'digital twin network', 'semantic communication'
];

function relevanceScore(title, abstract) {
  const text = ' ' + ((title || '') + ' ' + (abstract || '')).toLowerCase() + ' ';
  return RELEVANCE_TERMS.reduce((score, term) => {
    // word boundary check to avoid false matches like "gnb" matching "GNE"
    const regex = new RegExp('\\b' + term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b');
    return score + (regex.test(text) ? 1 : 0);
  }, 0);
}

async function searchOpenAlex(searchTerm, range, perPage = 15) {
  try {
    const { data } = await axios.get('https://api.openalex.org/works', {
      params: {
        search: searchTerm,
        filter: `from_publication_date:${range.from},to_publication_date:${range.to}`,
        sort: 'cited_by_count:desc',
        per_page: perPage,
        select: 'id,doi,title,display_name,publication_date,cited_by_count,authorships,abstract_inverted_index,primary_topic,keywords,open_access'
      },
      timeout: 15000
    });
    return data.results || [];
  } catch { return []; }
}

async function fetchHotPapers(n, days) {
  const range = getWeekRange(days);
  const searches = KEYWORD_GROUPS.map(kw => searchOpenAlex(kw, range));
  const allResults = (await Promise.all(searches)).flat();

  // deduplicate by id and title
  const seen = new Map();
  const seenTitles = new Set();
  for (const w of allResults) {
    const title = (w.display_name || w.title || '').toLowerCase().trim();
    if (!seen.has(w.id) && !seenTitles.has(title)) {
      seen.set(w.id, w);
      seenTitles.add(title);
    }
  }

  // score and filter
  return [...seen.values()]
    .map(w => {
      const abstract = invertedIndexToText(w.abstract_inverted_index);
      const score = relevanceScore(w.display_name || w.title, abstract);
      return { ...w, _abstract: abstract, _score: score };
    })
    .filter(w => w._score >= 3) // 최소 3개 통신 관련 용어 포함
    .sort((a, b) => (b._score * 10 + b.cited_by_count) - (a._score * 10 + a.cited_by_count))
    .slice(0, n)
    .map(w => ({
      title: w.display_name || w.title,
      doi: w.doi,
      publication_date: w.publication_date,
      cited_by_count: w.cited_by_count || 0,
      relevance_score: w._score,
      authors: (w.authorships || []).slice(0, 5).map(a => a.author && a.author.display_name).filter(Boolean),
      abstract: w._abstract,
      topic: w.primary_topic && w.primary_topic.display_name || null,
      field: w.primary_topic && w.primary_topic.field && w.primary_topic.field.display_name || null,
      keywords: (w.keywords || []).map(k => k.display_name),
      open_access: w.open_access && w.open_access.is_oa || false,
      openalex_url: w.id
    }));
}

app.get('/papers', async (req, res) => {
  try {
    const n = Math.min(parseInt(req.query.n) || 10, 50);
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const mode = req.query.mode || 'telecom';

    if (mode === 'invest') {
      // 투자 섹터별 hot 논문 + 산업 영향도 분석
      const sector = req.query.sector || null;
      const range = getWeekRange(days);
      var sectorsToSearch = sector ? { [sector]: INVEST_KEYWORD_GROUPS[sector] || [] } : INVEST_KEYWORD_GROUPS;
      var allPapers = {};

      for (var sectorName of Object.keys(sectorsToSearch)) {
        var keywords = sectorsToSearch[sectorName];
        var sectorPapers = [];
        for (var kw of keywords) {
          var results = await searchOpenAlex(kw, range, 5);
          sectorPapers = sectorPapers.concat(results);
        }

        // 중복 제거
        var seen = new Map();
        for (var p of sectorPapers) {
          if (!seen.has(p.id)) seen.set(p.id, p);
        }

        // 산업 영향도 분석 + 정렬
        var analyzed = [...seen.values()].map(function(w) {
          var abstract = invertedIndexToText(w.abstract_inverted_index);
          var kwList = (w.keywords || []).map(function(k) { return k.display_name; });
          var impact = calcIndustryImpact(w.display_name || w.title, abstract, kwList);
          return {
            title: w.display_name || w.title,
            doi: w.doi,
            publication_date: w.publication_date,
            cited_by_count: w.cited_by_count || 0,
            abstract: abstract.slice(0, 300),
            keywords: kwList,
            topic: w.primary_topic && w.primary_topic.display_name || null,
            industry_impact: impact
          };
        });

        // 산업 영향도 × 인용수로 정렬
        analyzed.sort(function(a, b) {
          return (b.industry_impact.score * 5 + b.cited_by_count) - (a.industry_impact.score * 5 + a.cited_by_count);
        });

        allPapers[sectorName] = {
          count: analyzed.length,
          high_impact_count: analyzed.filter(function(p) { return p.industry_impact.level === 'high'; }).length,
          papers: analyzed.slice(0, Math.min(n, 10))
        };
      }

      // 섹터별 산업 영향도 요약
      var sectorScores = {};
      for (var s of Object.keys(allPapers)) {
        var papers = allPapers[s];
        var avgImpact = papers.papers.length > 0
          ? papers.papers.reduce(function(sum, p) { return sum + p.industry_impact.score; }, 0) / papers.papers.length
          : 0;
        sectorScores[s] = {
          total_papers: papers.count,
          high_impact_papers: papers.high_impact_count,
          avg_impact_score: Math.round(avgImpact * 10) / 10,
          investment_signal: avgImpact >= 8 ? '🔥 강력 유망' : avgImpact >= 5 ? '📈 유망' : avgImpact >= 3 ? '➡️ 보통' : '📉 관심 감소'
        };
      }

      res.json({
        mode: 'invest',
        date_range: range,
        sector_scores: sectorScores,
        source: 'OpenAlex + Industry Impact Analysis',
        papers_by_sector: allPapers
      });
    } else {
      // 기존 통신 모드
      const papers = await fetchHotPapers(n, days);
      res.json({
        count: papers.length,
        keyword_groups: KEYWORD_GROUPS,
        date_range: getWeekRange(days),
        sort: 'relevance + cited_by_count (telecom hot papers)',
        source: 'OpenAlex',
        papers
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ===== Stock/ETF API =====
const fs = require('fs');
const path = require('path');
const CACHE_FILE = path.join(__dirname, '.stock_cache.json');
const ONE_DAY = 24 * 60 * 60 * 1000;

let stockCache = { data: null, timestamp: 0 };
try {
  const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  if (saved.timestamp && Date.now() - saved.timestamp < ONE_DAY) {
    stockCache = saved;
    console.log('Stock cache loaded from file:', new Date(saved.timestamp).toISOString());
  }
} catch {}

function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(stockCache)); } catch {}
}

const WATCHLIST = {
  main_index: {
    label: '📊 주요 지수',
    tickers: [
      { symbol: 'SPY', desc: 'S&P 500' },
      { symbol: 'QQQ', desc: '나스닥 100' }
    ],
    korea: {
      source: 'naver',
      items: [
        { code: 'KOSPI', type: 'index', desc: '코스피 종합지수' },
        { code: 'KOSDAQ', type: 'index', desc: '코스닥 종합지수' }
      ]
    }
  },
  sector_etf: {
    label: '🏭 섹터별 동향',
    tickers: [
      { symbol: 'SOXX', desc: '반도체' },
      { symbol: 'XBI', desc: '바이오테크' },
      { symbol: 'TAN', desc: '클린에너지' },
      { symbol: 'BOTZ', desc: 'AI/로봇' },
      { symbol: 'BITQ', desc: '크립토/블록체인' },
      { symbol: 'ARKK', desc: '혁신성장' }
    ]
  },
  global_market: {
    label: '🌏 주요국 시장',
    tickers: [
      { symbol: 'EWY', desc: '한국' },
      { symbol: 'FXI', desc: '중국' },
      { symbol: 'INDA', desc: '인도' },
      { symbol: 'EWJ', desc: '일본' },
      { symbol: 'EWG', desc: '독일' },
      { symbol: 'VWO', desc: '신흥국 전체' }
    ]
  }
};

async function fetchQuotes(items) {
  const symbols = items.map(i => typeof i === 'string' ? i : i.symbol).join(',');
  try {
    const { data } = await axios.get('https://query1.finance.yahoo.com/v8/finance/spark', {
      params: { symbols, range: '1d', interval: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    return items.map(item => {
      const sym = typeof item === 'string' ? item : item.symbol;
      const desc = typeof item === 'string' ? null : item.desc;
      const s = data[sym];
      if (!s || !s.close || !s.close[0]) return null;
      const price = s.close[s.close.length - 1];
      const prev = s.chartPreviousClose || price;
      const change = (price - prev).toFixed(2);
      const pct = prev ? ((price - prev) / prev * 100).toFixed(2) + '%' : '0%';
      return { ticker: sym, desc, price: price.toString(), change_amount: change, change_percentage: pct, volume: '-' };
    }).filter(Boolean);
  } catch { return []; }
}

async function fetchNaverItem(item) {
  try {
    const type = item.type === 'index' ? 'index' : 'stock';
    const { data } = await axios.get(`https://m.stock.naver.com/api/${type}/${item.code}/basic`, { timeout: 10000 });
    if (!data.closePrice) return null;
    return {
      ticker: item.code, desc: item.desc,
      price: data.closePrice.replace(/,/g, ''),
      change_amount: data.compareToPreviousClosePrice.replace(/,/g, ''),
      change_percentage: data.fluctuationsRatio + '%',
      volume: '-'
    };
  } catch { return null; }
}

async function fetchAllStocks() {
  if (stockCache.data && (Date.now() - stockCache.timestamp < ONE_DAY)) return stockCache.data;

  const watchlist = {};

  for (const [key, group] of Object.entries(WATCHLIST)) {
    if (key === 'main_index') {
      // main_index: yahoo tickers + naver korea indices
      const yahooQuotes = await fetchQuotes(group.tickers);
      const koreaQuotes = (await Promise.all(group.korea.items.map(fetchNaverItem))).filter(Boolean);
      watchlist[key] = { label: group.label, quotes: [...yahooQuotes, ...koreaQuotes] };
    } else {
      const quotes = await fetchQuotes(group.tickers);
      watchlist[key] = { label: group.label, quotes };
    }
  }

  stockCache.data = { watchlist, last_updated: new Date().toISOString() };
  stockCache.timestamp = Date.now();
  saveCache();
  return stockCache.data;
}

app.get('/watchlist', async (req, res) => {
  try {
    res.json(await fetchAllStocks());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 강제 캐시 무효화 + 재조회
app.get('/watchlist/refresh', async (req, res) => {
  try {
    stockCache = { data: null, timestamp: 0 }; // 캐시 무효화
    var result = await fetchAllStocks();
    res.json({ refreshed: true, last_updated: result.last_updated, data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/watchlist/refresh-korea', async (req, res) => {
  try {
    const koreaItems = WATCHLIST.main_index.korea.items;
    const quotes = (await Promise.all(koreaItems.map(fetchNaverItem))).filter(Boolean);
    if (stockCache.data) {
      // main_index quotes에서 한국 데이터만 갱신
      const yahooQuotes = stockCache.data.watchlist.main_index.quotes.filter(q => !koreaItems.find(k => k.code === q.ticker));
      stockCache.data.watchlist.main_index = { label: WATCHLIST.main_index.label, quotes: [...yahooQuotes, ...quotes] };
      stockCache.data.last_updated_korea = new Date().toISOString();
      saveCache();
    }
    res.json({ label: '한국 지수', quotes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== /mingyulist - ISA 투자 추천 =====
const ISA_UNIVERSE = [
  // 한국 주식 (대기업)
  { symbol: '005930', name: '삼성전자', type: 'kr_stock', sector: '반도체', weight: 1.3 },
  { symbol: '000660', name: 'SK하이닉스', type: 'kr_stock', sector: '반도체', weight: 1.3 },
  { symbol: '373220', name: 'LG에너지솔루션', type: 'kr_stock', sector: '배터리', weight: 1.1 },
  { symbol: '005380', name: '현대차', type: 'kr_stock', sector: '자동차', weight: 1.1 },
  { symbol: '035420', name: 'NAVER', type: 'kr_stock', sector: 'IT/플랫폼', weight: 1.2 },
  { symbol: '035720', name: '카카오', type: 'kr_stock', sector: 'IT/플랫폼', weight: 1.0 },
  { symbol: '006400', name: '삼성SDI', type: 'kr_stock', sector: '배터리', weight: 1.0 },
  { symbol: '051910', name: 'LG화학', type: 'kr_stock', sector: '화학/배터리', weight: 1.0 },
  { symbol: '003670', name: '포스코퓨처엠', type: 'kr_stock', sector: '소재', weight: 0.9 },
  { symbol: '247540', name: '에코프로비엠', type: 'kr_stock', sector: '2차전지소재', weight: 0.9 },
  // 한국 ETF
  { symbol: '069500', name: 'KODEX 200', type: 'kr_etf', sector: '국내지수', weight: 1.2 },
  { symbol: '229200', name: 'KODEX 코스닥150', type: 'kr_etf', sector: '국내지수', weight: 1.0 },
  { symbol: '091160', name: 'KODEX 반도체', type: 'kr_etf', sector: '반도체', weight: 1.3 },
  { symbol: '091170', name: 'KODEX 은행', type: 'kr_etf', sector: '금융', weight: 1.0 },
  { symbol: '266360', name: 'KODEX 2차전지산업', type: 'kr_etf', sector: '2차전지', weight: 1.1 },
  { symbol: '364690', name: 'KODEX Fn K-뉴딜디지털플러스', type: 'kr_etf', sector: 'IT/디지털', weight: 0.9 },
  // 해외 ETF (ISA에서 투자 가능한 국내상장 해외ETF)
  { symbol: '379800', name: 'KODEX 미국S&P500TR', type: 'kr_etf', sector: '미국지수', weight: 1.3 },
  { symbol: '379810', name: 'KODEX 미국나스닥100TR', type: 'kr_etf', sector: '미국나스닥', weight: 1.3 },
  { symbol: '453810', name: 'KODEX 미국반도체MV', type: 'kr_etf', sector: '미국반도체', weight: 1.2 },
  { symbol: '200250', name: 'KOSEF 인도Nifty50', type: 'kr_etf', sector: '인도', weight: 1.0 },
  { symbol: '371460', name: 'TIGER 차이나전기차SOLACTIVE', type: 'kr_etf', sector: '중국전기차', weight: 0.8 },
  { symbol: '143850', name: 'TIGER 미국S&P500', type: 'kr_etf', sector: '미국지수', weight: 1.2 },
  { symbol: '133690', name: 'TIGER 미국나스닥100', type: 'kr_etf', sector: '미국나스닥', weight: 1.2 }
];

async function fetchNaverStockPrice(code) {
  try {
    const { data } = await axios.get(`https://m.stock.naver.com/api/stock/${code}/basic`, { timeout: 10000 });
    if (!data) return null;
    const price = parseInt((data.closePrice || '0').replace(/,/g, ''));
    const change = parseFloat(data.fluctuationsRatio || '0');
    return { price, change_pct: change };
  } catch { return null; }
}

async function fetchNaverETFPrice(code) {
  try {
    // ETF도 stock API로 조회 가능
    const { data } = await axios.get(`https://m.stock.naver.com/api/stock/${code}/basic`, { timeout: 10000 });
    if (!data) return null;
    const price = parseInt((data.closePrice || '0').replace(/,/g, ''));
    const change = parseFloat(data.fluctuationsRatio || '0');
    return { price, change_pct: change };
  } catch { return null; }
}

async function fetchNaver5DayChange(code) {
  try {
    const { data } = await axios.get(`https://m.stock.naver.com/api/stock/${code}/price?pageSize=5&page=1`, { timeout: 10000 });
    if (!data || !data.length || data.length < 2) return null;
    const latest = parseInt((data[0].closePrice || '0').replace(/,/g, ''));
    const oldest = parseInt((data[data.length - 1].closePrice || '0').replace(/,/g, ''));
    if (!oldest) return null;
    return ((latest - oldest) / oldest * 100);
  } catch { return null; }
}

// ===== 밸류에이션 데이터 (PER/PBR/ROE/배당/시가총액/동일업종PER) =====

// 동일업종 PER 가져오기 (데스크톱 네이버 금융에서 파싱)
async function fetchSectorPer(stockCode) {
  try {
    var url = 'https://finance.naver.com/item/main.naver?code=' + stockCode;
    var resp = await axios.get(url, { timeout: 10000, responseType: 'text' });
    var html = resp.data;

    // 동일업종 PER 파싱: <em>17.68</em>배
    var perMatch = html.match(/동일업종 PER[\s\S]*?<em>([\d.]+)<\/em>배/);
    var sectorPer = perMatch ? parseFloat(perMatch[1]) : null;

    // 동일업종 등락률 파싱: +3.08% 또는 -1.23%
    var rateMatch = html.match(/동일업종 등락률[\s\S]*?<em>\s*([+\-]?[\d.]+%)\s*<\/em>/);
    var sectorChange = rateMatch ? parseFloat(rateMatch[1].replace('%', '')) : null;

    return { sectorPer: sectorPer, sectorChange: sectorChange };
  } catch (e) {
    return { sectorPer: null, sectorChange: null };
  }
}

async function fetchValuation(stockCode) {
  try {
    var url = 'https://m.stock.naver.com/api/stock/' + stockCode + '/integration';
    var resp = await axios.get(url, { timeout: 10000 });
    var data = resp.data;
    if (!data || !data.totalInfos) return null;

    var infos = {};
    for (var i = 0; i < data.totalInfos.length; i++) {
      var item = data.totalInfos[i];
      infos[item.code] = item.value || '';
    }

    var per = parseFloat((infos.per || '0').replace(/[배,]/g, '')) || null;
    var cnsPer = parseFloat((infos.cnsPer || '0').replace(/[배,]/g, '')) || null;
    var pbr = parseFloat((infos.pbr || '0').replace(/[배,]/g, '')) || null;
    var dividend = parseFloat((infos.dividendYieldRatio || '0').replace(/[%,]/g, '')) || null;
    var high52 = parseInt((infos.highPriceOf52Weeks || '0').replace(/[,원]/g, '')) || null;
    var low52 = parseInt((infos.lowPriceOf52Weeks || '0').replace(/[,원]/g, '')) || null;
    var foreignRate = parseFloat((infos.foreignRate || '0').replace(/[%,]/g, '')) || null;

    // 시가총액 파싱 (단위: 백만원, "1,572조 6,489억" 또는 "33조 4,291억" 또는 "5,540,601" 형태)
    var marketCapRaw = infos.marketValue || '';
    var marketCap = null;
    if (marketCapRaw.includes('조')) {
      var joMatch = marketCapRaw.match(/([\d,]+)조\s*([\d,]*)억?/);
      if (joMatch) {
        var jo = parseInt(joMatch[1].replace(/,/g, '')) || 0;
        var eok = parseInt((joMatch[2] || '0').replace(/,/g, '')) || 0;
        marketCap = jo * 10000 + eok; // 억원 단위
      }
    } else {
      // 숫자만 있는 경우 (백만원 단위)
      var numVal = parseInt(marketCapRaw.replace(/[,]/g, '')) || 0;
      if (numVal > 0) marketCap = Math.round(numVal / 100); // 백만원 → 억원
    }

    // 시가총액 기반 대형/중소형주 분류
    var capCategory = null;
    if (marketCap) {
      if (marketCap >= 100000) capCategory = 'large';       // 10조 이상: 대형주
      else if (marketCap >= 20000) capCategory = 'mid';     // 2조~10조: 중형주
      else capCategory = 'small';                            // 2조 미만: 소형주
    }

    // 동일업종 PER 가져오기
    var sectorData = await fetchSectorPer(stockCode);
    var sectorPer = sectorData.sectorPer;
    var sectorChange = sectorData.sectorChange;

    // ROE 근사치 계산: ROE ≈ PBR / PER * 100
    var roe = (per && pbr && per > 0) ? Math.round(pbr / per * 10000) / 100 : null;

    // 밸류에이션 점수 계산 (최대 ±18점, 기존 ±12에서 확장)
    var score = 0;

    // PER 기반 (추정PER 우선, 없으면 현재PER)
    var usePer = cnsPer || per;
    if (usePer) {
      if (usePer < 8) score += 8;           // 극저평가
      else if (usePer < 12) score += 5;      // 저평가
      else if (usePer < 18) score += 2;      // 적정~약간 저평가
      else if (usePer > 40) score -= 5;      // 고평가
      else if (usePer > 25) score -= 2;      // 약간 고평가
    }

    // PBR 기반
    if (pbr) {
      if (pbr < 0.8) score += 4;             // 자산 대비 저평가
      else if (pbr < 1.2) score += 2;
      else if (pbr > 5) score -= 3;          // 고평가
    }

    // 배당 보너스
    if (dividend && dividend > 3) score += 3;
    else if (dividend && dividend > 2) score += 1;

    // 동일업종 PER 대비 상대 밸류에이션 (최대 ±6점)
    var sectorPerScore = 0;
    var perVsSector = null;
    if (usePer && sectorPer && sectorPer > 0) {
      perVsSector = Math.round((usePer / sectorPer - 1) * 1000) / 10; // % 차이
      // 업종 PER 대비 30% 이상 저렴 → 강한 저평가 신호
      if (perVsSector <= -30) sectorPerScore = 6;
      else if (perVsSector <= -15) sectorPerScore = 4;
      else if (perVsSector <= -5) sectorPerScore = 2;
      // 업종 PER 대비 30% 이상 비싸면 → 고평가 신호
      else if (perVsSector >= 50) sectorPerScore = -4;
      else if (perVsSector >= 30) sectorPerScore = -3;
      else if (perVsSector >= 15) sectorPerScore = -1;
    }
    score += sectorPerScore;

    // 시가총액 기반 안정성 가중치 (최대 ±3점)
    var capScore = 0;
    if (capCategory === 'large') capScore = 2;       // 대형주: 유동성/안정성 프리미엄
    else if (capCategory === 'mid') capScore = 1;    // 중형주: 약간 프리미엄
    else if (capCategory === 'small') capScore = -1; // 소형주: 리스크 디스카운트
    score += capScore;

    // 52주 저점 근접 보너스 (현재가가 52주 저점 대비 10% 이내면 가산)
    // → 이미 phase1에서 하락 반영하므로 여기선 생략

    return {
      per: usePer,
      trailing_per: per,
      forward_per: cnsPer,
      pbr: pbr,
      roe: roe,
      dividend_yield: dividend,
      high_52w: high52,
      low_52w: low52,
      foreign_rate: foreignRate,
      market_cap: marketCap,             // 억원 단위
      cap_category: capCategory,          // 'large', 'mid', 'small'
      cap_score: capScore,
      sector_per: sectorPer,             // 동일업종 PER
      sector_change: sectorChange,       // 동일업종 등락률(%)
      per_vs_sector: perVsSector,        // 업종 대비 PER 차이(%)
      sector_per_score: sectorPerScore,
      score: Math.max(-18, Math.min(18, score))
    };
  } catch (e) {
    return null;
  }
}

// ===== 환율/금리 데이터 =====
var fxRateCache = { data: null, timestamp: 0 };
var FX_CACHE_DURATION = 4 * 60 * 60 * 1000; // 4시간

async function fetchFxAndRates() {
  if (fxRateCache.data && (Date.now() - fxRateCache.timestamp < FX_CACHE_DURATION)) return fxRateCache.data;

  try {
    var resp = await axios.get('https://query1.finance.yahoo.com/v8/finance/spark', {
      params: { symbols: 'KRW=X,^TNX,^IRX', range: '5d', interval: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    var d = resp.data;

    var result = {};

    // USD/KRW 환율
    var krw = d['KRW=X'];
    if (krw && krw.close && krw.close.length >= 2) {
      var currFx = krw.close[krw.close.length - 1];
      var prevFx = krw.chartPreviousClose || krw.close[0];
      var fxChange = (currFx - prevFx) / prevFx * 100;
      result.usdkrw = { rate: Math.round(currFx * 100) / 100, change_pct: Math.round(fxChange * 100) / 100 };
    }

    // 미국 10년물 국채 금리
    var tnx = d['^TNX'];
    if (tnx && tnx.close && tnx.close.length >= 1) {
      var currRate = tnx.close[tnx.close.length - 1];
      var prevRate = tnx.chartPreviousClose || tnx.close[0];
      var rateChange = currRate - prevRate;
      result.us10y = { rate: Math.round(currRate * 100) / 100, change: Math.round(rateChange * 100) / 100 };
    }

    // 미국 3개월물 (단기 금리)
    var irx = d['^IRX'];
    if (irx && irx.close && irx.close.length >= 1) {
      result.us3m = { rate: Math.round(irx.close[irx.close.length - 1] * 100) / 100 };
    }

    fxRateCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (e) {
    return fxRateCache.data || {};
  }
}

function calcFxScore(fxData, sector) {
  if (!fxData || !fxData.usdkrw) return { score: 0 };

  var fxChange = fxData.usdkrw.change_pct || 0;
  var score = 0;

  // 원화 약세(환율 상승) → 수출주 유리, 내수주 불리
  var exportSectors = ['반도체', '미국반도체', '자동차', '배터리', '2차전지', '2차전지소재'];
  var domesticSectors = ['IT/플랫폼', 'IT/디지털', '금융', '국내지수'];

  if (fxChange > 1) {
    // 원화 급락 (환율 급등)
    if (exportSectors.includes(sector)) score += 5;       // 수출주 수혜
    if (domesticSectors.includes(sector)) score -= 3;     // 내수주 불리
  } else if (fxChange > 0.3) {
    if (exportSectors.includes(sector)) score += 2;
  } else if (fxChange < -1) {
    // 원화 강세 (환율 하락)
    if (domesticSectors.includes(sector)) score += 3;     // 내수주 수혜
    if (exportSectors.includes(sector)) score -= 2;       // 수출주 불리
  }

  // 금리 영향
  if (fxData.us10y) {
    var rateChange = fxData.us10y.change || 0;
    // 금리 급등 → 성장주(IT, 나스닥) 불리
    if (rateChange > 0.05) {
      var growthSectors = ['IT/플랫폼', 'IT/디지털', '미국나스닥', '혁신성장'];
      if (growthSectors.includes(sector)) score -= 3;
    } else if (rateChange < -0.05) {
      // 금리 하락 → 성장주 유리
      var growthSectors2 = ['IT/플랫폼', 'IT/디지털', '미국나스닥', '혁신성장'];
      if (growthSectors2.includes(sector)) score += 3;
    }
  }

  return { score: Math.max(-8, Math.min(8, score)), fx_change: fxChange, rate_10y: fxData.us10y ? fxData.us10y.rate : null };
}

// ===== A: 뉴스 + 감성 분석 =====
const POSITIVE_KEYWORDS = [
  '급등', '상승', '호재', '신고가', '돌파', '수혜', '성장', '호실적',
  '매수', '목표가 상향', '상향', '흑자', '수주', '계약', '기대',
  '반등', '회복', '강세', '최고', '사상최고', '실적개선', '턴어라운드',
  '배당', '자사주', '매출증가', '이익증가', '컨센서스 상회'
];
const NEGATIVE_KEYWORDS = [
  '급락', '하락', '악재', '신저가', '폭락', '매도', '손절', '적자',
  '하향', '목표가 하향', '리스크', '우려', '부진', '감소', '약세',
  '물타기', '반토막', '하한가', '실적부진', '영업손실', '적자전환',
  '소송', '제재', '과징금', '리콜', '철수', '감산', '감원', '구조조정'
];

async function fetchNaverNews(stockCode) {
  try {
    const url = `https://m.stock.naver.com/api/news/stock/${stockCode}?pageSize=20&page=1`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (!data || !data.length) return { score: 0, positive: 0, negative: 0, headlines: [] };

    let positive = 0;
    let negative = 0;
    const headlines = [];

    for (const article of data.slice(0, 15)) {
      const title = article.title || '';
      headlines.push(title);
      const titleLower = title.toLowerCase();

      for (const kw of POSITIVE_KEYWORDS) {
        if (titleLower.includes(kw)) { positive++; break; }
      }
      for (const kw of NEGATIVE_KEYWORDS) {
        if (titleLower.includes(kw)) { negative++; break; }
      }
    }

    const score = positive - negative; // +면 긍정 우세, -면 부정 우세
    return { score, positive, negative, total: data.length, headlines: headlines.slice(0, 5) };
  } catch {
    return { score: 0, positive: 0, negative: 0, headlines: [] };
  }
}

// 네이버 종목 토론방 감성 분석
const FORUM_POSITIVE = [
  '매수', '존버', '가즈아', '떡상', '물량', '저점', '담았다', '추매',
  '바닥', '반등', '기대', '홀딩', '모아가자', '장기투자', '배당'
];
const FORUM_NEGATIVE = [
  '매도', '손절', '물타기', '폭락', '개미털기', '탈출', '빠져라', '망함',
  '하락', '고점', '물렸다', '존버실패', '청산', '위험', '도망'
];

async function fetchNaverForum(stockCode) {
  try {
    const url = `https://m.stock.naver.com/api/discuss/stock/${stockCode}?pageSize=30&page=1`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (!data || !data.length) return { score: 0, positive: 0, negative: 0, sentiment: 'neutral' };

    let positive = 0;
    let negative = 0;

    for (const post of data.slice(0, 20)) {
      const title = (post.title || post.content || '').toLowerCase();

      for (const kw of FORUM_POSITIVE) {
        if (title.includes(kw)) { positive++; break; }
      }
      for (const kw of FORUM_NEGATIVE) {
        if (title.includes(kw)) { negative++; break; }
      }
    }

    const score = positive - negative;
    const total = positive + negative || 1;
    const ratio = positive / total;
    let sentiment = 'neutral';
    if (ratio > 0.65) sentiment = 'bullish';
    else if (ratio < 0.35) sentiment = 'bearish';

    return { score, positive, negative, sentiment, sample_size: data.length };
  } catch {
    return { score: 0, positive: 0, negative: 0, sentiment: 'neutral' };
  }
}


// ===== Twitter API v2 감성 수집 =====
const TWITTER_BEARER_TOKEN = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAAJXB%2BQEAAAAAmv931g1f9kwjpeNU5SMKEr%2BfJoQ%3DxzkAyv4zna85YPq7lOGrc8lVgN7AUgrV9ddO9C6ka9FbIVMBBg');

async function fetchTwitterSentiment(query) {
  try {
    var url = 'https://api.twitter.com/2/tweets/search/recent';
    var resp = await axios.get(url, {
      params: {
        query: query + ' -is:retweet lang:en',
        max_results: 20,
        'tweet.fields': 'public_metrics,created_at'
      },
      headers: {
        'Authorization': 'Bearer ' + TWITTER_BEARER_TOKEN,
        'User-Agent': 'StockBot/1.0'
      },
      timeout: 10000
    });

    var tweets = resp.data && resp.data.data;
    if (!tweets || !tweets.length) return { score: 0, mentions: 0, sentiment: 'neutral' };

    var posWords = ['buy', 'bull', 'moon', 'undervalued', 'long', 'dip', 'bullish', 'rocket', 'calls', 'breakout', 'upgrade'];
    var negWords = ['sell', 'bear', 'crash', 'overvalued', 'short', 'puts', 'bearish', 'dump', 'avoid', 'downgrade', 'tariff'];

    var positive = 0, negative = 0;
    for (var i = 0; i < tweets.length; i++) {
      var text = (tweets[i].text || '').toLowerCase();
      for (var j = 0; j < posWords.length; j++) {
        if (text.includes(posWords[j])) { positive++; break; }
      }
      for (var k = 0; k < negWords.length; k++) {
        if (text.includes(negWords[k])) { negative++; break; }
      }
    }

    var score = positive - negative;
    var total = positive + negative || 1;
    var ratio = positive / total;
    var sentiment = 'neutral';
    if (ratio > 0.6) sentiment = 'bullish';
    else if (ratio < 0.4) sentiment = 'bearish';

    return { score: score, mentions: tweets.length, positive: positive, negative: negative, sentiment: sentiment };
  } catch (err) {
    // rate limit이나 에러 시 graceful 처리
    return { score: 0, mentions: 0, sentiment: 'neutral' };
  }
}

// ===== StockTwits API 감성 수집 =====
// StockTwits 심볼 매핑
function getStockTwitsSymbol(item) {
  var map = {
    '379800': 'SPY',    // KODEX S&P500 → SPY 추적
    '379810': 'QQQ',    // KODEX 나스닥100 → QQQ
    '453810': 'SOXX',   // KODEX 미국반도체 → SOXX
    '143850': 'SPY',    // TIGER S&P500
    '133690': 'QQQ',    // TIGER 나스닥100
    '200250': 'INDA',   // KOSEF 인도
    '371460': 'FXI'     // TIGER 차이나
  };
  return map[item.symbol] || null;
}

async function fetchStockTwitsSentiment(symbol) {
  try {
    var url = 'https://api.stocktwits.com/api/2/streams/symbol/' + symbol + '.json';
    var resp = await axios.get(url, { timeout: 10000 });
    var messages = resp.data && resp.data.messages;
    if (!messages || !messages.length) return { score: 0, mentions: 0, sentiment: 'neutral' };

    var bullish = 0, bearish = 0;
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (msg.entities && msg.entities.sentiment) {
        if (msg.entities.sentiment.basic === 'Bullish') bullish++;
        else if (msg.entities.sentiment.basic === 'Bearish') bearish++;
      }
    }

    var score = bullish - bearish;
    var total = bullish + bearish || 1;
    var ratio = bullish / total;
    var sentiment = 'neutral';
    if (ratio > 0.6) sentiment = 'bullish';
    else if (ratio < 0.4) sentiment = 'bearish';

    return { score: score, mentions: messages.length, bullish: bullish, bearish: bearish, sentiment: sentiment };
  } catch {
    return { score: 0, mentions: 0, sentiment: 'neutral' };
  }
}

// ===== C: 글로벌 데이터 =====

// Google News RSS로 섹터별 글로벌 이슈 감지
async function fetchGlobalNews(sector) {
  const sectorQueries = {
    '반도체': 'semiconductor+chip+stock',
    '미국반도체': 'semiconductor+NVIDIA+AMD+stock',
    '미국나스닥': 'nasdaq+tech+stock+market',
    '미국지수': 'S%26P500+stock+market',
    'IT/플랫폼': 'tech+platform+NAVER+Kakao',
    '배터리': 'EV+battery+stock',
    '2차전지': 'battery+lithium+stock',
    '2차전지소재': 'battery+materials+cathode',
    '자동차': 'EV+auto+Hyundai+stock',
    '중국전기차': 'China+EV+BYD+stock',
    '인도': 'India+market+Nifty',
    '금융': 'bank+financial+stock+Korea'
  };

  const query = sectorQueries[sector] || sector;
  try {
    const url = `https://news.google.com/rss/search?q=${query}+when:3d&hl=en-US&gl=US&ceid=US:en`;
    const { data } = await axios.get(url, { timeout: 10000 });

    // 간단 XML 파싱 (title 추출)
    const titles = [];
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
    let match;
    while ((match = titleRegex.exec(data)) !== null) {
      titles.push(match[1] || match[2] || '');
    }

    // 감성 분석 (영문)
    const posWords = ['surge', 'rally', 'gain', 'rise', 'bull', 'record', 'growth', 'beat', 'upgrade', 'buy'];
    const negWords = ['crash', 'fall', 'drop', 'bear', 'sell', 'decline', 'loss', 'miss', 'downgrade', 'fear', 'risk', 'tariff', 'ban'];

    let positive = 0, negative = 0;
    for (const title of titles.slice(0, 15)) {
      const lower = title.toLowerCase();
      if (posWords.some(w => lower.includes(w))) positive++;
      if (negWords.some(w => lower.includes(w))) negative++;
    }

    return { score: positive - negative, positive, negative, total: titles.length, headlines: titles.slice(1, 4) };
  } catch {
    return { score: 0, positive: 0, negative: 0, total: 0, headlines: [] };
  }
}

// Reddit 감성 수집 (r/stocks, r/wallstreetbets 등)
async function fetchRedditSentiment(query) {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=20`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (StockBot/1.0)' },
      timeout: 10000
    });

    if (!data || !data.data || !data.data.children || !data.data.children.length) return { score: 0, mentions: 0, sentiment: 'neutral' };

    const posts = data.data.children;
    let positive = 0, negative = 0, totalScore = 0;

    const posWords = ['buy', 'bull', 'moon', 'undervalued', 'hold', 'long', 'dip', 'calls', 'bullish', 'rocket'];
    const negWords = ['sell', 'bear', 'crash', 'overvalued', 'short', 'puts', 'dump', 'bearish', 'avoid', 'bubble'];

    for (const post of posts) {
      const title = (post.data.title || '').toLowerCase();
      const ups = post.data.ups || 0;
      totalScore += ups;

      if (posWords.some(w => title.includes(w))) positive++;
      if (negWords.some(w => title.includes(w))) negative++;
    }

    const score = positive - negative;
    const ratio = (positive + negative) > 0 ? positive / (positive + negative) : 0.5;
    let sentiment = 'neutral';
    if (ratio > 0.6) sentiment = 'bullish';
    else if (ratio < 0.4) sentiment = 'bearish';

    return { score, mentions: posts.length, positive, negative, sentiment, avg_upvotes: Math.round(totalScore / posts.length) };
  } catch {
    return { score: 0, mentions: 0, sentiment: 'neutral' };
  }
}

// ===== B: 재무/공시 데이터 =====
const xml2js = require('xml2js');

// 네이버 증권 공시 조회 (DART 대체, API키 불필요)
async function fetchDisclosure(stockCode) {
  try {
    const url = `https://m.stock.naver.com/api/stock/${stockCode}/disclosure?pageSize=5&page=1`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (!data || !data.length) return { hasRecent: false, discScore: 0, disclosures: [] };

    const disclosures = data.slice(0, 5).map(d => ({
      title: d.title || d.disclosureTitle || '',
      date: d.date || d.disclosureDate || ''
    }));

    // 실적 관련 공시 감지
    const earningsKw = ['영업실적', '실적', '매출액', '영업이익', '분기보고서', '사업보고서', '잠정실적'];
    const hasEarnings = disclosures.some(d => earningsKw.some(kw => d.title.includes(kw)));

    // 긍정/부정 공시
    const positiveKw = ['자사주', '배당', '신규투자', '수주', '계약체결', '합병', 'MOU', '흑자', '증가'];
    const negativeKw = ['감사의견', '소송', '횡령', '불성실', '상장폐지', '관리종목', '감자', '적자', '감소'];

    let discScore = 0;
    for (const d of disclosures) {
      if (positiveKw.some(kw => d.title.includes(kw))) discScore++;
      if (negativeKw.some(kw => d.title.includes(kw))) discScore--;
    }

    return { hasRecent: true, hasEarnings, discScore, disclosures };
  } catch {
    return { hasRecent: false, discScore: 0, disclosures: [] };
  }
}

// Yahoo Finance Earnings 조회 (해외 ETF 기초지수 기업 실적)
async function fetchYahooEarnings(ticker) {
  try {
    const { data } = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
      params: { modules: 'earningsTrend,calendarEvents' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    const result = data && data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result[0];
    if (!result) return null;

    const calendar = result.calendarEvents;
    let earningsDate = null;
    let surprise = null;

    if (calendar && calendar.earnings && calendar.earnings.earningsDate && calendar.earnings.earningsDate[0] && calendar.earnings.earningsDate[0].raw) {
      earningsDate = new Date(calendar.earnings.earningsDate[0].raw * 1000).toISOString().slice(0, 10);
    }

    const earnings = result.earningsTrend;
    if (earnings && earnings.trend) {
      for (const t of earnings.trend) {
        if (t.earningsEstimate && t.earningsEstimate.avg && t.earningsEstimate.avg.raw != null && t.actual && t.actual.raw != null) {
          surprise = ((t.actual.raw - t.earningsEstimate.avg.raw) / Math.abs(t.earningsEstimate.avg.raw) * 100).toFixed(1);
          break;
        }
      }
    }

    return { earningsDate, surprise };
  } catch {
    return null;
  }
}

// ===== I: 기관/외국인 투자자 흐름 =====
async function fetchInstitutionalFlow(stockCode) {
  try {
    var url = 'https://m.stock.naver.com/api/stock/' + stockCode + '/integration';
    var resp = await axios.get(url, { timeout: 10000 });
    var data = resp.data;
    if (!data || !data.dealTrendInfos || !data.dealTrendInfos.length) {
      return { foreign: [], organ: [], foreignHoldRatio: null, days: 0 };
    }

    var trends = data.dealTrendInfos.slice(0, 5); // 최근 5거래일
    var foreign = [];
    var organ = [];
    var foreignHoldRatio = null;

    for (var i = 0; i < trends.length; i++) {
      var t = trends[i];
      var fBuy = parseInt((t.foreignerPureBuyQuant || '0').replace(/[,+]/g, ''));
      var oBuy = parseInt((t.organPureBuyQuant || '0').replace(/[,+]/g, ''));
      foreign.push(fBuy);
      organ.push(oBuy);
      if (i === 0 && t.foreignerHoldRatio) {
        foreignHoldRatio = parseFloat(t.foreignerHoldRatio.replace('%', ''));
      }
    }

    return { foreign: foreign, organ: organ, foreignHoldRatio: foreignHoldRatio, days: trends.length };
  } catch (e) {
    return { foreign: [], organ: [], foreignHoldRatio: null, days: 0 };
  }
}

function calcInstitutionalScore(flow) {
  if (!flow || flow.days === 0) return { score: 0, foreignScore: 0, organScore: 0, trend: 'neutral', detail: null };

  var foreignTotal = flow.foreign.reduce(function(s, v) { return s + v; }, 0);
  var organTotal = flow.organ.reduce(function(s, v) { return s + v; }, 0);

  // 연속 매수/매도 일수 계산
  var foreignConsecutiveBuy = 0;
  var organConsecutiveBuy = 0;
  for (var i = 0; i < flow.foreign.length; i++) {
    if (flow.foreign[i] > 0) foreignConsecutiveBuy++;
    else break;
  }
  for (var i = 0; i < flow.organ.length; i++) {
    if (flow.organ[i] > 0) organConsecutiveBuy++;
    else break;
  }

  var foreignScore = 0;
  var organScore = 0;

  // 외국인 점수 (최대 ±10점)
  if (foreignConsecutiveBuy >= 4) foreignScore += 8;
  else if (foreignConsecutiveBuy >= 3) foreignScore += 6;
  else if (foreignConsecutiveBuy >= 2) foreignScore += 3;
  else if (foreignTotal > 0) foreignScore += 1;

  // 5일 연속 매도 감지
  var foreignConsecutiveSell = 0;
  for (var i = 0; i < flow.foreign.length; i++) {
    if (flow.foreign[i] < 0) foreignConsecutiveSell++;
    else break;
  }
  if (foreignConsecutiveSell >= 4) foreignScore -= 8;
  else if (foreignConsecutiveSell >= 3) foreignScore -= 5;
  else if (foreignConsecutiveSell >= 2) foreignScore -= 3;
  else if (foreignTotal < 0) foreignScore -= 1;

  // 기관 점수 (최대 ±10점)
  if (organConsecutiveBuy >= 4) organScore += 8;
  else if (organConsecutiveBuy >= 3) organScore += 6;
  else if (organConsecutiveBuy >= 2) organScore += 3;
  else if (organTotal > 0) organScore += 1;

  var organConsecutiveSell = 0;
  for (var i = 0; i < flow.organ.length; i++) {
    if (flow.organ[i] < 0) organConsecutiveSell++;
    else break;
  }
  if (organConsecutiveSell >= 4) organScore -= 8;
  else if (organConsecutiveSell >= 3) organScore -= 5;
  else if (organConsecutiveSell >= 2) organScore -= 3;
  else if (organTotal < 0) organScore -= 1;

  // 외국인 보유비율 보너스 (고보유 종목에 약간 가산)
  if (flow.foreignHoldRatio && flow.foreignHoldRatio > 40 && foreignTotal > 0) foreignScore += 2;

  // 동반 매수: 기관+외국인 동시 순매수 시 시너지
  if (foreignTotal > 0 && organTotal > 0) {
    foreignScore += 2;
    organScore += 2;
  }

  var totalScore = Math.max(-15, Math.min(15, foreignScore + organScore));

  // 트렌드 판단
  var trend = 'neutral';
  if (totalScore >= 8) trend = 'strong_buy';
  else if (totalScore >= 4) trend = 'buy';
  else if (totalScore <= -8) trend = 'strong_sell';
  else if (totalScore <= -4) trend = 'sell';

  return {
    score: totalScore,
    foreignScore: foreignScore,
    organScore: organScore,
    trend: trend,
    detail: {
      foreign_5d_total: foreignTotal,
      organ_5d_total: organTotal,
      foreign_consecutive_buy: foreignConsecutiveBuy,
      organ_consecutive_buy: organConsecutiveBuy,
      foreign_hold_ratio: flow.foreignHoldRatio
    }
  };
}

// ===== 네이버 금융 리서치 (증권사 목표가/투자의견) =====
async function fetchNaverResearch(stockCode) {
  try {
    var url = 'https://m.stock.naver.com/api/stock/' + stockCode + '/integration';
    var resp = await axios.get(url, { timeout: 10000 });
    var data = resp.data;
    if (!data) return { avgTarget: null, recommMean: null, opinions: { buy: 0, hold: 0, sell: 0 }, reports: [] };

    // 컨센서스 정보 (목표가 평균 + 투자의견 평균)
    var consensus = data.consensusInfo || {};
    var avgTarget = consensus.priceTargetMean ? parseInt(consensus.priceTargetMean.replace(/,/g, '')) : null;
    var recommMean = consensus.recommMean ? parseFloat(consensus.recommMean) : null;
    // recommMean: 5=강력매수, 4=매수, 3=중립, 2=매도, 1=강력매도

    // 개별 리포트에서 추가 정보
    var researches = data.researches || [];
    var reports = researches.slice(0, 5).map(function(r) {
      return {
        broker: r.bnm || '',
        title: r.tit || '',
        date: r.wdt || ''
      };
    });

    // 투자의견 분류 (recommMean 기반)
    var opinions = { buy: 0, hold: 0, sell: 0 };
    if (recommMean >= 3.5) opinions.buy = 1;
    else if (recommMean >= 2.5) opinions.hold = 1;
    else if (recommMean) opinions.sell = 1;

    return {
      avgTarget: avgTarget,
      recommMean: recommMean,
      opinions: opinions,
      reportCount: researches.length,
      reports: reports
    };
  } catch (e) {
    return { avgTarget: null, recommMean: null, opinions: { buy: 0, hold: 0, sell: 0 }, reports: [] };
  }
}

function calcResearchScore(research, currentPrice) {
  if (!research.avgTarget || !currentPrice) return { score: 0, upside: null };

  var upside = (research.avgTarget - currentPrice) / currentPrice * 100;
  var score = 0;

  // 상승여력 기반 점수 (최대 ±12점)
  if (upside > 30) score += 12;
  else if (upside > 20) score += 9;
  else if (upside > 10) score += 6;
  else if (upside > 0) score += 3;
  else if (upside < -10) score -= 8;
  else if (upside < 0) score -= 4;

  // 투자의견 평균 (recommMean: 5=강매수 ~ 1=강매도, 최대 ±8점)
  if (research.recommMean) {
    if (research.recommMean >= 4.0) score += 8;
    else if (research.recommMean >= 3.5) score += 4;
    else if (research.recommMean < 2.5) score -= 6;
    else if (research.recommMean < 3.0) score -= 3;
  }

  return { score: score, upside: Math.round(upside * 10) / 10 };
}

// ===== 매크로 뉴스 RSS (시장 전체 분위기) =====
var MACRO_RSS_FEEDS = [
  { name: '연합뉴스 경제', url: 'https://www.yna.co.kr/rss/economy.xml', lang: 'kr' },
  { name: '한경 증권', url: 'https://www.hankyung.com/feed/stock', lang: 'kr' },
  { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', lang: 'en' },
  { name: 'CNBC Top News', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', lang: 'en' }
];

var MACRO_POSITIVE_KR = ['상승', '호재', '완화', '인하', '회복', '반등', '성장', '흑자', '수출증가', '투자확대', '부양'];
var MACRO_NEGATIVE_KR = ['하락', '악재', '긴축', '인상', '침체', '급락', '위기', '적자', '무역전쟁', '관세', '제재', '매도', '폭락', '불안'];
var MACRO_POSITIVE_EN = ['rally', 'rise', 'gain', 'recovery', 'growth', 'cut', 'easing', 'stimulus', 'surge', 'bullish', 'record'];
var MACRO_NEGATIVE_EN = ['fall', 'crash', 'recession', 'hike', 'hawkish', 'tariff', 'sanction', 'crisis', 'sell-off', 'fear', 'risk', 'war', 'inflation'];

async function fetchMacroNews() {
  var totalPositive = 0;
  var totalNegative = 0;
  var headlines = [];

  for (var i = 0; i < MACRO_RSS_FEEDS.length; i++) {
    var feed = MACRO_RSS_FEEDS[i];
    try {
      var resp = await axios.get(feed.url, { timeout: 8000 });
      var xml = resp.data;

      // 간단 XML 파싱 (title 추출)
      var titles = [];
      var titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
      var match;
      while ((match = titleRegex.exec(xml)) !== null) {
        var t = match[1] || match[2] || '';
        if (t && t !== feed.name && !t.includes('RSS') && !t.includes('xml')) titles.push(t);
      }

      var posKw = feed.lang === 'kr' ? MACRO_POSITIVE_KR : MACRO_POSITIVE_EN;
      var negKw = feed.lang === 'kr' ? MACRO_NEGATIVE_KR : MACRO_NEGATIVE_EN;

      for (var j = 0; j < Math.min(titles.length, 10); j++) {
        var title = titles[j].toLowerCase();
        var isPos = false, isNeg = false;
        for (var k = 0; k < posKw.length; k++) {
          if (title.includes(posKw[k])) { isPos = true; break; }
        }
        for (var k = 0; k < negKw.length; k++) {
          if (title.includes(negKw[k])) { isNeg = true; break; }
        }
        if (isPos) totalPositive++;
        if (isNeg) totalNegative++;
      }

      // 주요 헤드라인 수집
      for (var j = 0; j < Math.min(titles.length, 3); j++) {
        headlines.push('[' + feed.name + '] ' + titles[j]);
      }
    } catch (e) {
      // RSS 실패는 무시
    }
  }

  var score = totalPositive - totalNegative;
  var sentiment = 'neutral';
  if (score >= 5) sentiment = 'positive';
  else if (score <= -5) sentiment = 'negative';

  return {
    score: score,
    positive: totalPositive,
    negative: totalNegative,
    sentiment: sentiment,
    headlines: headlines.slice(0, 8)
  };
}

// ===== H: 학술 트렌드 분석 (주 1회 갱신) =====
var ACADEMIC_CACHE_FILE = path.join(__dirname, '.academic_trend_cache.json');
var academicTrendCache = { data: null, timestamp: 0 };
try {
  var savedAcademic = JSON.parse(fs.readFileSync(ACADEMIC_CACHE_FILE, 'utf8'));
  if (savedAcademic.timestamp) {
    academicTrendCache = savedAcademic;
    console.log('Academic trend cache loaded:', new Date(savedAcademic.timestamp).toISOString());
  }
} catch (e) {}

// 섹터별 학술 검색 키워드
var SECTOR_ACADEMIC_QUERIES = {
  '반도체': 'semiconductor chip fabrication advanced packaging',
  '미국반도체': 'semiconductor AI chip GPU computing',
  'IT/플랫폼': 'platform economy digital transformation AI',
  'IT/디지털': 'digital transformation cloud computing',
  '미국나스닥': 'artificial intelligence machine learning large language model',
  '미국지수': 'US economy monetary policy market',
  '배터리': 'lithium ion battery solid state battery',
  '2차전지': 'battery recycling cathode anode material',
  '2차전지소재': 'cathode material lithium nickel cobalt',
  '자동차': 'electric vehicle autonomous driving EV',
  '중국전기차': 'China electric vehicle BYD battery',
  '인도': 'India digital economy manufacturing growth',
  '금융': 'fintech digital banking Korea',
  '국내지수': 'Korea economy export semiconductor',
  '소재': 'advanced materials supply chain',
  '화학/배터리': 'chemical process battery electrolyte'
};

async function fetchAcademicTrend(sector) {
  var query = SECTOR_ACADEMIC_QUERIES[sector] || sector;
  try {
    // 최근 90일 논문 수 조회
    var now = new Date();
    var d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    var d180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    var toDate = now.toISOString().slice(0, 10);
    var from90 = d90.toISOString().slice(0, 10);
    var from180 = d180.toISOString().slice(0, 10);

    // 최근 90일 논문
    var resp1 = await axios.get('https://api.openalex.org/works', {
      params: {
        search: query,
        filter: 'from_publication_date:' + from90 + ',to_publication_date:' + toDate,
        per_page: 1
      },
      timeout: 15000
    });
    var recentCount = (resp1.data && resp1.data.meta && resp1.data.meta.count) || 0;

    // 이전 90일 (90~180일 전) 논문
    var resp2 = await axios.get('https://api.openalex.org/works', {
      params: {
        search: query,
        filter: 'from_publication_date:' + from180 + ',to_publication_date:' + from90,
        per_page: 1
      },
      timeout: 15000
    });
    var prevCount = (resp2.data && resp2.data.meta && resp2.data.meta.count) || 0;

    // 증가율 계산
    var growthRate = prevCount > 0 ? ((recentCount - prevCount) / prevCount * 100) : 0;

    return {
      sector: sector,
      recent_papers: recentCount,
      prev_papers: prevCount,
      growth_rate: Math.round(growthRate * 10) / 10,
      query: query
    };
  } catch (e) {
    return { sector: sector, recent_papers: 0, prev_papers: 0, growth_rate: 0 };
  }
}

async function refreshAcademicTrends() {
  // 논문 서버의 /papers?mode=invest를 호출하여 섹터별 산업 영향도 분석
  try {
    var resp = await axios.get('http://localhost:' + PORT + '/papers?mode=invest&days=90&n=10', { timeout: 180000 });
    var data = resp.data;
    if (!data || !data.sector_scores) throw new Error('Invalid response from papers API');

    var trends = {};
    var sectorScores = data.sector_scores;

    for (var sector of Object.keys(sectorScores)) {
      var ss = sectorScores[sector];
      // 산업 영향도 기반 점수 계산
      var avgImpact = ss.avg_impact_score || 0;
      var score = 0;
      if (avgImpact >= 8) score = 8;         // 🔥 강력 유망
      else if (avgImpact >= 6) score = 6;    // 📈 유망
      else if (avgImpact >= 4) score = 4;    // 보통+
      else if (avgImpact >= 2) score = 2;    // 보통
      else if (avgImpact < 1) score = -2;    // 관심 감소

      trends[sector] = {
        total_papers: ss.total_papers,
        high_impact_papers: ss.high_impact_papers,
        avg_impact_score: avgImpact,
        signal: ss.investment_signal,
        academic_score: score
      };
    }

    // ISA 종목 섹터로 매핑 (논문 섹터 → mingyulist 섹터)
    var sectorMapping = {
      '반도체': ['반도체', '미국반도체'],
      '미국나스닥': ['미국나스닥', 'IT/플랫폼', 'IT/디지털'],
      '배터리': ['배터리', '2차전지', '2차전지소재', '화학/배터리'],
      '자동차': ['자동차'],
      '바이오': [],
      '클린에너지': [],
      'AI/로봇': ['미국나스닥']
    };

    // ISA 섹터별 최종 점수 계산
    var investSectorScores = {};
    for (var paperSector of Object.keys(trends)) {
      var mapped = sectorMapping[paperSector] || [];
      for (var i = 0; i < mapped.length; i++) {
        var isaSector = mapped[i];
        if (!investSectorScores[isaSector] || trends[paperSector].academic_score > investSectorScores[isaSector]) {
          investSectorScores[isaSector] = trends[paperSector].academic_score;
        }
      }
    }

    academicTrendCache = {
      data: investSectorScores,
      raw_trends: trends,
      timestamp: Date.now(),
      generated_at: new Date().toISOString()
    };

    try { fs.writeFileSync(ACADEMIC_CACHE_FILE, JSON.stringify(academicTrendCache)); } catch (e) {}
    return { trends: trends, sector_scores: investSectorScores };
  } catch (e) {
    // fallback: 기존 OpenAlex 직접 호출
    var sectors = Object.keys(SECTOR_ACADEMIC_QUERIES);
    var trends = {};
    for (var i = 0; i < sectors.length; i++) {
      var sector = sectors[i];
      trends[sector] = await fetchAcademicTrend(sector);
      await new Promise(function(resolve) { setTimeout(resolve, 1000); });
    }
    academicTrendCache = { data: trends, timestamp: Date.now(), generated_at: new Date().toISOString() };
    try { fs.writeFileSync(ACADEMIC_CACHE_FILE, JSON.stringify(academicTrendCache)); } catch (e) {}
    return { trends: trends };
  }
}

function getAcademicScore(sector) {
  if (!academicTrendCache.data) return 0;
  // 직접 매핑된 점수가 있으면 사용
  if (typeof academicTrendCache.data[sector] === 'number') return academicTrendCache.data[sector];
  // 구버전 호환 (growth_rate 기반)
  var trend = academicTrendCache.data[sector];
  if (!trend) return 0;
  if (trend.academic_score !== undefined) return trend.academic_score;
  var growth = trend.growth_rate || 0;
  if (growth > 50) return 8;
  if (growth > 30) return 6;
  if (growth > 15) return 4;
  if (growth > 5) return 2;
  if (growth < -20) return -4;
  if (growth < -10) return -2;
  return 0;
}

// 학술 트렌드 갱신 엔드포인트
app.get('/mingyulist/academic-refresh', async (req, res) => {
  try {
    var result = await refreshAcademicTrends();
    res.json({
      title: '📚 섹터별 학술 트렌드 + 산업 영향도 (주간 갱신)',
      generated_at: new Date().toISOString(),
      method: '논문 서버 /papers?mode=invest → 산업 영향도 키워드 분석',
      sector_academic_scores: academicTrendCache.data,
      raw_analysis: result.trends || result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ROTATION_SIGNALS = [
  { ticker: 'SOXX', sector: '반도체', type: 'yahoo' },
  { ticker: 'XBI', sector: '바이오', type: 'yahoo' },
  { ticker: 'TAN', sector: '클린에너지', type: 'yahoo' },
  { ticker: 'BOTZ', sector: 'AI/로봇', type: 'yahoo' },
  { ticker: 'BITQ', sector: '크립토', type: 'yahoo' },
  { ticker: 'ARKK', sector: '혁신성장', type: 'yahoo' },
  { ticker: 'SPY', sector: '시장전체', type: 'yahoo' },
  { ticker: 'QQQ', sector: '기술주', type: 'yahoo' },
  { ticker: 'FXI', sector: '중국', type: 'yahoo' },
  { ticker: 'INDA', sector: '인도', type: 'yahoo' },
  { ticker: 'EWY', sector: '한국', type: 'yahoo' }
];

// 섹터 → ISA 종목 매핑
const SECTOR_MAPPING = {
  '반도체': ['반도체', '미국반도체'],
  'AI/로봇': ['IT/플랫폼', 'IT/디지털'],
  '혁신성장': ['IT/플랫폼', 'IT/디지털', '미국나스닥'],
  '클린에너지': ['배터리', '2차전지', '2차전지소재', '화학/배터리'],
  '크립토': [],
  '바이오': [],
  '중국': ['중국전기차'],
  '인도': ['인도'],
  '한국': ['국내지수'],
  '시장전체': ['미국지수'],
  '기술주': ['미국나스닥', 'IT/플랫폼']
};

async function detectRotation() {
  const quotes = await fetchQuotes(ROTATION_SIGNALS.map(s => ({ symbol: s.ticker, desc: s.sector })));
  if (!quotes.length) return { detected: false, flows: [], market_context: '' };

  const sectorChanges = {};
  for (const q of quotes) {
    const sig = ROTATION_SIGNALS.find(s => s.ticker === q.ticker);
    if (sig) sectorChanges[sig.sector] = parseFloat(q.change_percentage);
  }

  const spyChange = sectorChanges['시장전체'] || 0;

  // 로테이션 감지: 특정 섹터가 시장 대비 -5% 이상 언더퍼폼
  const outflows = []; // 자금 유출 섹터
  const inflows = [];  // 자금 유입 섹터

  for (const [sector, change] of Object.entries(sectorChanges)) {
    if (sector === '시장전체') continue;
    const relativePerf = change - spyChange;
    if (relativePerf < -3) outflows.push({ sector, change, relative: relativePerf });
    else if (relativePerf > 1.0) inflows.push({ sector, change, relative: relativePerf });
  }

  outflows.sort((a, b) => a.relative - b.relative);
  inflows.sort((a, b) => b.relative - a.relative);

  // 로테이션 감지: 유출 섹터가 있으면 발동 (유입이 없어도 "방어적 로테이션")
  const detected = outflows.length > 0;

  // 시장 컨텍스트 생성
  let context = '';
  if (detected && inflows.length > 0) {
    const outNames = outflows.map(o => o.sector).join(', ');
    const inNames = inflows.map(i => i.sector).join(', ');
    context = `섹터 로테이션 감지: [${outNames}]에서 자금 유출 → [${inNames}]로 유입`;
  } else if (detected && inflows.length === 0) {
    const outNames = outflows.map(o => o.sector).join(', ');
    context = `[${outNames}] 섹터 자금 이탈 감지 → 해당 섹터 추격매수 주의, 다른 섹터 분산 권장`;
  } else if (spyChange < -3) {
    context = '시장 전체 급락 (패닉 셀링) → 현금 비중 확대 권장';
  } else if (spyChange < -1) {
    context = '시장 전반 약세 → 우량주 분할매수 구간';
  } else {
    context = '시장 안정적 → 기본 전략 유지';
  }

  return { detected, outflows, inflows, sectorChanges, spyChange, market_context: context };
}

async function analyzeISAUniverse() {
  // ========== 1단계: 가격 스크리닝 (빠름) ==========
  const rotation = await detectRotation();

  const penaltySectors = new Set();
  const bonusSectors = new Set();
  if (rotation.detected) {
    for (const out of rotation.outflows) {
      (SECTOR_MAPPING[out.sector] || []).forEach(s => penaltySectors.add(s));
    }
    for (const inf of rotation.inflows) {
      (SECTOR_MAPPING[inf.sector] || []).forEach(s => bonusSectors.add(s));
    }
  }

  // 1차: 가격 + 로테이션만으로 빠르게 점수 산출
  const phase1 = [];
  for (const item of ISA_UNIVERSE) {
    const priceData = await fetchNaverStockPrice(item.symbol);
    if (!priceData || !priceData.price) continue;

    const change5d = await fetchNaver5DayChange(item.symbol);
    const todayChange = priceData.change_pct;

    let score = 0;

    // 하락 → 반등 기회 (최대 20점으로 제한)
    if (todayChange < 0) score += Math.min(Math.abs(todayChange) * 1.5, 10);
    if (change5d !== null && change5d < 0) score += Math.min(Math.abs(change5d) * 1, 10);

    // 대기업/신뢰 가중치
    score += (item.weight - 0.8) * signalWeights.weight_multiplier;

    // ISA 투자 선호도: ETF >>>>>> 대기업 개별종목 > 중소형 개별종목
    // ETF는 분산효과+수수료 효율로 기본 우대
    if (item.type === 'kr_etf') score += 12;
    // 개별종목은 대기업(weight 1.1+)만 기본 포함, 중소형은 감점
    else if (item.type === 'kr_stock' && item.weight < 1.0) score -= 8;

    // 활성 섹터
    var hotSectors = ['반도체', '미국나스닥', '미국지수', 'AI/로봇', '미국반도체', 'IT/플랫폼'];
    if (hotSectors.includes(item.sector)) score += signalWeights.hot_sector_bonus;

    // 로테이션 반영
    if (rotation.detected) {
      if (penaltySectors.has(item.sector)) { score *= signalWeights.rotation_penalty; score -= 10; }
      if (bonusSectors.has(item.sector)) score += signalWeights.rotation_bonus;
    }

    // 패닉 시 저품질 감점
    if (rotation.spyChange < -3 && item.weight < 1.1) score -= 15;

    // 위험/모멘텀 필터
    if (todayChange < -10) score -= 10;
    if (todayChange > 2 && !bonusSectors.has(item.sector)) score -= 15;
    if (change5d !== null && change5d > 5 && !bonusSectors.has(item.sector)) score -= 10;

    phase1.push({
      ...item,
      price: priceData.price,
      todayChange,
      change5d,
      phase1Score: Math.round(score * 10) / 10,
      rotation_effect: penaltySectors.has(item.sector) ? '⚠️ 자금유출 섹터' : bonusSectors.has(item.sector) ? '🟢 자금유입 섹터' : null
    });
  }

  // 1차 점수로 정렬 (2차에서 순차적으로 꺼냄)
  phase1.sort((a, b) => b.phase1Score - a.phase1Score);

  // ========== 2단계: 심층 분석 (7개 채울 때까지 순차 분석) ==========
  // 매크로 뉴스: 시장 전체이므로 1회만 호출
  var macro = await fetchMacroNews();

  // Twitter는 섹터별 1회만 호출 (API 한도 절약: 월 1500건 제한)
  var twitterBySector = {};
  var twitterQueries = {
    '반도체': 'semiconductor stock',
    '미국반도체': 'semiconductor NVIDIA AMD stock',
    '미국나스닥': 'nasdaq QQQ tech stock',
    '미국지수': 'S&P500 SPY market',
    'IT/플랫폼': 'Korea tech platform stock',
    'IT/디지털': 'Korea digital tech',
    '배터리': 'EV battery stock',
    '2차전지': 'battery lithium stock',
    '2차전지소재': 'cathode battery materials',
    '자동차': 'Hyundai EV auto stock',
    '국내지수': 'Korea KOSPI stock',
    '중국전기차': 'China EV BYD stock',
    '인도': 'India Nifty stock',
    '금융': 'Korea bank financial',
    '화학/배터리': 'chemical battery Korea',
    '소재': 'materials stock Korea'
  };

  var TARGET_PICKS = 10;
  var MIN_SCORE = 10;
  var MIN_PICKS = 5;
  var results = [];
  var analyzed = 0;
  var idx = 0;

  while (results.length < TARGET_PICKS && idx < phase1.length) {
    var item = phase1[idx];
    idx++;
    analyzed++;

    // Twitter: 해당 섹터 아직 안 호출했으면 호출
    if (!twitterBySector[item.sector]) {
      var tq = twitterQueries[item.sector] || item.sector + ' stock';
      twitterBySector[item.sector] = await fetchTwitterSentiment(tq);
    }

    var score = item.phase1Score;

    // A: 네이버 뉴스 감성
    var newsSentiment = { score: 0, positive: 0, negative: 0, headlines: [] };
    var forumSentiment = { score: 0, positive: 0, negative: 0, sentiment: 'neutral' };
    var disclosure = { hasRecent: false, discScore: 0, disclosures: [] };
    if (item.type === 'kr_stock' || item.type === 'kr_etf') {
      newsSentiment = await fetchNaverNews(item.symbol);
      if (item.type === 'kr_stock') {
        forumSentiment = await fetchNaverForum(item.symbol);
        disclosure = await fetchDisclosure(item.symbol);
      }
    }

    // B: 글로벌 뉴스
    var globalNews = await fetchGlobalNews(item.sector);

    // C: Reddit
    var redditQuery = (item.name.includes('KODEX') || item.name.includes('TIGER')) ? item.sector : item.name;
    var reddit = await fetchRedditSentiment(redditQuery);

    // D: Twitter (섹터별 캐시)
    var twitter = twitterBySector[item.sector] || { score: 0, mentions: 0, sentiment: 'neutral' };

    // E: StockTwits
    var stocktwits = { score: 0, mentions: 0, sentiment: 'neutral' };
    if (item.sector.includes('미국') || item.type === 'kr_etf') {
      var stwitsSymbol = getStockTwitsSymbol(item);
      if (stwitsSymbol) stocktwits = await fetchStockTwitsSentiment(stwitsSymbol);
    }

    // 점수 반영 (자기개선 가중치 적용)
    score += Math.max(-15, Math.min(15, newsSentiment.score * signalWeights.news));
    if (forumSentiment.sentiment === 'bullish') score += 7;
    else if (forumSentiment.sentiment === 'bearish') score -= 5;
    score += Math.max(-10, Math.min(10, forumSentiment.score * signalWeights.forum));

    if (disclosure.hasRecent) {
      score += Math.max(-10, Math.min(10, disclosure.discScore * 5));
      if (disclosure.hasEarnings) score += 3;
    }

    score += Math.max(-10, Math.min(10, globalNews.score * signalWeights.global_news));

    if (reddit.mentions >= 5) {
      if (reddit.sentiment === 'bullish') score += 6;
      else if (reddit.sentiment === 'bearish') score -= 4;
      score += Math.max(-8, Math.min(8, reddit.score));
    }

    if (twitter.mentions >= 3) {
      if (twitter.sentiment === 'bullish') score += 7;
      else if (twitter.sentiment === 'bearish') score -= 5;
      score += Math.max(-10, Math.min(10, twitter.score * signalWeights.twitter));
    }

    if (stocktwits.mentions >= 3) {
      if (stocktwits.sentiment === 'bullish') score += 6;
      else if (stocktwits.sentiment === 'bearish') score -= 4;
      score += Math.max(-8, Math.min(8, stocktwits.score));
    }

    // F: 증권사 리서치 (한국 주식만, 최대 ±30점)
    var research = { avgTarget: null, opinions: { buy: 0, hold: 0, sell: 0 } };
    var researchScore = { score: 0, upside: null };
    if (item.type === 'kr_stock') {
      research = await fetchNaverResearch(item.symbol);
      researchScore = calcResearchScore(research, item.price);
      score += researchScore.score;
    }

    // G: 매크로 뉴스 (시장 전체, 최대 ±8점)
    score += Math.max(-8, Math.min(8, macro.score));

    // H: 학술 트렌드 (주간 캐시, 최대 ±8점)
    var academicScore = getAcademicScore(item.sector);
    score += academicScore;

    // I: 기관/외국인 투자자 흐름 (최대 ±15점)
    var instFlow = await fetchInstitutionalFlow(item.symbol);
    var instScore = calcInstitutionalScore(instFlow);
    score += instScore.score;

    // J: 밸류에이션 (최대 ±12점, 한국 주식만)
    var valuation = null;
    if (item.type === 'kr_stock') {
      valuation = await fetchValuation(item.symbol);
      if (valuation && valuation.score) score += valuation.score;
    }

    // K: 환율/금리 (최대 ±8점)
    var fxData = await fetchFxAndRates();
    var fxScore = calcFxScore(fxData, item.sector);
    score += fxScore.score;

    score = Math.round(score * 10) / 10;

    // ISA 투자 정책: 중견기업 이하 개별종목은 확신 있을 때만 추천
    // ETF는 기본 임계값, 대형주는 기본 임계값, 중소형주는 높은 임계값 적용
    var itemMinScore = MIN_SCORE;
    if (item.type === 'kr_stock' && valuation && valuation.cap_category !== 'large') {
      itemMinScore = MIN_SCORE * 2.5; // 중소형 개별종목: 25점 이상이어야 추천 (확신 필요)
    } else if (item.type === 'kr_stock' && !valuation) {
      itemMinScore = MIN_SCORE * 2; // 밸류에이션 데이터 없는 개별종목도 높은 기준 적용
    }

    // 임계값 이상만 추천 리스트에 추가 (단, 최소 5개는 확보 - ETF 우선)
    var shouldInclude = score > itemMinScore;
    // 최소 5개 미달 시: ETF와 대형주만 낮은 기준으로 허용
    if (!shouldInclude && results.length < MIN_PICKS) {
      if (item.type === 'kr_etf' || (item.type === 'kr_stock' && valuation && valuation.cap_category === 'large')) {
        shouldInclude = true;
      }
    }

    if (shouldInclude) {
      results.push({
        symbol: item.symbol,
        name: item.name,
        type: item.type,
        sector: item.sector,
        price: item.price,
        today_change: item.todayChange + '%',
        week_change: item.change5d !== null ? item.change5d.toFixed(2) + '%' : 'N/A',
        score: score,
        phase1_score: item.phase1Score,
        weight: item.weight,
        rotation_effect: item.rotation_effect,
        news: { score: newsSentiment.score, positive: newsSentiment.positive, negative: newsSentiment.negative },
        forum: { score: forumSentiment.score, sentiment: forumSentiment.sentiment },
        disclosure: { score: disclosure.discScore, hasEarnings: disclosure.hasEarnings || false },
        global_news: { score: globalNews.score, positive: globalNews.positive, negative: globalNews.negative },
        reddit: { score: reddit.score, mentions: reddit.mentions, sentiment: reddit.sentiment },
        twitter: { score: twitter.score, mentions: twitter.mentions, sentiment: twitter.sentiment },
        stocktwits: { score: stocktwits.score, mentions: stocktwits.mentions, sentiment: stocktwits.sentiment },
        research: { target_price: research.avgTarget, upside: researchScore.upside, opinions: research.opinions, score: researchScore.score },
        macro: { score: macro.score, sentiment: macro.sentiment },
        academic: { score: academicScore, growth_rate: (academicTrendCache.data && academicTrendCache.data[item.sector]) ? academicTrendCache.data[item.sector].growth_rate : null },
        institutional: { score: instScore.score, foreign_score: instScore.foreignScore, organ_score: instScore.organScore, trend: instScore.trend, detail: instScore.detail },
        valuation: valuation ? { per: valuation.per, pbr: valuation.pbr, roe: valuation.roe, dividend_yield: valuation.dividend_yield, high_52w: valuation.high_52w, low_52w: valuation.low_52w, market_cap: valuation.market_cap, cap_category: valuation.cap_category, cap_score: valuation.cap_score, sector_per: valuation.sector_per, per_vs_sector: valuation.per_vs_sector, sector_per_score: valuation.sector_per_score, score: valuation.score } : null,
        fx_rate: { score: fxScore.score, usdkrw: fxData.usdkrw ? fxData.usdkrw.rate : null, fx_change: fxScore.fx_change, rate_10y: fxScore.rate_10y }
      });
    }
  }

  // 최종 점수 정렬 → 임계값 이상 5~10개
  results.sort((a, b) => b.score - a.score);
  var topPicks = results.slice(0, TARGET_PICKS);
  // 최소 5개 확보 후, 나머지는 임계값 이상만 유지
  if (topPicks.length > MIN_PICKS) {
    topPicks = topPicks.filter(function(r, idx) { return idx < MIN_PICKS || r.score > MIN_SCORE; });
  }

  const recommendations = topPicks.map(pick => {
    const reason = generateReason(pick, rotation);
    return {
      ...pick,
      reason
    };
  });

  return { recommendations, rotation, macro: macro, screened: phase1.length, analyzed: analyzed, twitter_calls: Object.keys(twitterBySector).length };
}

function generateReason(pick, rotation) {
  const parts = [];

  const todayNum = parseFloat(pick.today_change);
  const weekNum = parseFloat(pick.week_change);

  // 로테이션 관련
  if (pick.rotation_effect === '🟢 자금유입 섹터') {
    parts.push('📈 자금 유입 섹터 (로테이션 수혜)');
  } else if (pick.rotation_effect === '⚠️ 자금유출 섹터') {
    parts.push('⚠️ 자금 유출 중이나 과매도 반등 가능');
  }

  // 뉴스 감성
  if (pick.news && pick.news.score >= 3) parts.push('📰 뉴스 긍정적 분위기');
  else if (pick.news && pick.news.score <= -3) parts.push('📰 뉴스 부정적 → 역발상 매수 구간');

  // 토론방 감성
  if (pick.forum && pick.forum.sentiment === 'bullish') parts.push('💬 커뮤니티 매수 심리 강함');
  else if (pick.forum && pick.forum.sentiment === 'bearish') parts.push('💬 커뮤니티 공포 → 역발상 기회');

  // 글로벌 뉴스/Reddit
  if (pick.global_news && pick.global_news.score >= 3) parts.push('🌍 글로벌 뉴스 긍정적');
  else if (pick.global_news && pick.global_news.score <= -3) parts.push('🌍 글로벌 악재 → 주의');
  if (pick.reddit && pick.reddit.sentiment === 'bullish' && pick.reddit.mentions >= 5) parts.push('🗣️ 해외 커뮤니티 관심↑');

  // Twitter/StockTwits
  if (pick.twitter && pick.twitter.sentiment === 'bullish' && pick.twitter.mentions >= 3) parts.push('🐦 트위터 긍정적');
  else if (pick.twitter && pick.twitter.sentiment === 'bearish' && pick.twitter.mentions >= 3) parts.push('🐦 트위터 부정적 → 주의');
  if (pick.stocktwits && pick.stocktwits.sentiment === 'bullish' && pick.stocktwits.mentions >= 3) parts.push('📊 StockTwits 매수 우세');

  // 증권사 리서치
  if (pick.research && pick.research.upside !== null) {
    if (pick.research.upside > 20) parts.push('🎯 증권사 목표가 상승여력 ' + pick.research.upside + '%');
    else if (pick.research.upside > 10) parts.push('📋 목표가 대비 ' + pick.research.upside + '% 저평가');
    else if (pick.research.upside < -5) parts.push('⚠️ 목표가 하회 → 주의');
  }

  // 매크로
  if (pick.macro && pick.macro.sentiment === 'positive') parts.push('🌐 매크로 환경 우호적');
  else if (pick.macro && pick.macro.sentiment === 'negative') parts.push('🌐 매크로 악재 주의');

  // 학술 트렌드
  if (pick.academic && pick.academic.score >= 6) parts.push('📚 학술 연구 폭발적 증가 (장기 유망)');
  else if (pick.academic && pick.academic.score >= 4) parts.push('📚 학술 관심 증가 추세');

  // 기관/외국인 투자자 흐름
  if (pick.institutional) {
    if (pick.institutional.trend === 'strong_buy') parts.push('🏦 기관+외국인 강력 순매수 (수급 호조)');
    else if (pick.institutional.trend === 'buy') parts.push('🏦 기관/외국인 순매수 흐름');
    else if (pick.institutional.trend === 'strong_sell') parts.push('🏦 기관+외국인 대량 매도 → 주의');
    else if (pick.institutional.trend === 'sell') parts.push('🏦 기관/외국인 매도 우세');
    if (pick.institutional.detail && pick.institutional.detail.foreign_hold_ratio > 40 && pick.institutional.score > 0) {
      parts.push('🌍 외국인 보유비율 ' + pick.institutional.detail.foreign_hold_ratio + '%');
    }
  }

  // 하락 관련
  if (todayNum < -3) parts.push(`오늘 ${pick.today_change} 급락 → 단기 반등 기대`);
  else if (todayNum < 0) parts.push(`소폭 조정(${pick.today_change}) → 저점 매수`);

  if (!isNaN(weekNum) && weekNum < -5) parts.push(`주간 ${pick.week_change} → 기술적 반등 구간`);

  // 섹터/신뢰
  if (pick.weight >= 1.2) parts.push('우량 대형주/ETF');

  // 밸류에이션 (시가총액/업종PER 비교)
  if (pick.valuation) {
    if (pick.valuation.per_vs_sector !== null && pick.valuation.per_vs_sector <= -20) {
      parts.push('💰 동일업종 대비 ' + Math.abs(pick.valuation.per_vs_sector) + '% 저평가');
    } else if (pick.valuation.per_vs_sector !== null && pick.valuation.per_vs_sector >= 30) {
      parts.push('⚠️ 업종 대비 PER 고평가');
    }
    if (pick.valuation.cap_category === 'large') parts.push('🏢 대형주');
  }
  if (pick.type === 'kr_etf') parts.push('📦 ETF (ISA 최적)');

  if (parts.length === 0) parts.push(`${pick.sector} 분할매수 적합`);

  return parts.join(' | ');
}

app.get('/mingyulist', async (req, res) => {
  try {
    // 캐시가 있으면 참조 (cron refresh/overnight 결과 활용)
    // 캐시 유효기간: 평일 24시간, 주말(토~일) 72시간 (금요일 캐시 유지)
    var now = new Date();
    var day = now.getDay(); // 0=일, 6=토
    var cacheMaxAge = (day === 0 || day === 6 || day === 1) ? 72 * 60 * 60 * 1000 : ONE_DAY;
    if (mingyuCache.data && (Date.now() - mingyuCache.timestamp < cacheMaxAge)) {
      var cached = mingyuCache.data;

      // overnight 보정이 있으면 함께 반환
      var overnightData = null;
      try {
        var overnightCacheFile = path.join(__dirname, '.mingyulist_overnight.json');
        var savedOvernight = JSON.parse(fs.readFileSync(overnightCacheFile, 'utf8'));
        if (savedOvernight.timestamp && Date.now() - savedOvernight.timestamp < ONE_DAY) {
          overnightData = savedOvernight.data;
        }
      } catch (e) {}

      var response = Object.assign({}, cached);
      response.source = 'cache';
      response.cache_age = Math.round((Date.now() - mingyuCache.timestamp) / 60000) + '분 전';
      if (overnightData) {
        response.overnight = overnightData;
      }
      return res.json(response);
    }

    // 캐시 없으면 새로 계산
    const result = await analyzeISAUniverse();
    const recommendations = result.recommendations;
    const rotation = result.rotation;

    var responseData = {
      title: '🎯 민규의 ISA 매수 추천 리스트',
      strategy: 'ETF 우선 + 섹터 로테이션 감지 + 대형주 위주 + 업종PER 비교 기반',
      market_analysis: {
        context: rotation.market_context,
        rotation_detected: rotation.detected,
        outflow_sectors: (rotation.outflows || []).map(o => `${o.sector}(${o.change.toFixed(2)}%)`),
        inflow_sectors: (rotation.inflows || []).map(i => `${i.sector}(${i.change > 0 ? '+' : ''}${i.change.toFixed(2)}%)`),
        macro_news: {
          sentiment: result.macro.sentiment,
          score: result.macro.score,
          headlines: result.macro.headlines
        }
      },
      pipeline: {
        total_universe: result.screened,
        deep_analyzed: result.analyzed,
        twitter_api_calls: result.twitter_calls,
        final_picks: recommendations.length
      },
      generated_at: new Date().toISOString(),
      source: 'realtime',
      disclaimer: '⚠️ AI 기반 참고용 추천이며, 투자 판단은 본인 책임입니다.',
      recommendations
    };

    // 새로 계산한 결과도 캐시에 저장
    mingyuCache = { data: responseData, timestamp: Date.now() };
    saveMingyuCache();

    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== mingyulist 캐시 (메인 분석 결과 저장) =====
const MINGYU_CACHE_FILE = path.join(__dirname, '.mingyulist_cache.json');
var mingyuCache = { data: null, timestamp: 0 };
try {
  var savedMingyu = JSON.parse(fs.readFileSync(MINGYU_CACHE_FILE, 'utf8'));
  if (savedMingyu.timestamp) {
    mingyuCache = savedMingyu;
    console.log('Mingyulist cache loaded:', new Date(savedMingyu.timestamp).toISOString());
  }
} catch (e) {}

function saveMingyuCache() {
  try { fs.writeFileSync(MINGYU_CACHE_FILE, JSON.stringify(mingyuCache)); } catch (e) {}
}

// 메인 분석 실행 + 캐시 저장 (cron에서 호출)
app.get('/mingyulist/refresh', async (req, res) => {
  try {
    const result = await analyzeISAUniverse();
    const recommendations = result.recommendations;
    const rotation = result.rotation;

    var responseData = {
      title: '🎯 민규의 ISA 매수 추천 리스트',
      strategy: 'ETF 우선 + 섹터 로테이션 감지 + 대형주 위주 + 업종PER 비교 기반',
      market_analysis: {
        context: rotation.market_context,
        rotation_detected: rotation.detected,
        outflow_sectors: (rotation.outflows || []).map(o => `${o.sector}(${o.change.toFixed(2)}%)`),
        inflow_sectors: (rotation.inflows || []).map(i => `${i.sector}(${i.change > 0 ? '+' : ''}${i.change.toFixed(2)}%)`)
      },
      pipeline: {
        total_universe: result.screened,
        deep_analyzed: result.analyzed,
        twitter_api_calls: result.twitter_calls,
        final_picks: recommendations.length
      },
      generated_at: new Date().toISOString(),
      type: 'main',
      disclaimer: '⚠️ AI 기반 참고용 추천이며, 투자 판단은 본인 책임입니다.',
      recommendations
    };

    // 캐시 저장
    mingyuCache = { data: responseData, timestamp: Date.now() };
    saveMingyuCache();

    // 일자별 백업 저장
    saveBackup(responseData);

    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== /mingyulist/overnight - 미장 결과 반영 보조 분석 =====
app.get('/mingyulist/overnight', async (req, res) => {
  try {
    // 메인 캐시가 없으면 에러
    if (!mingyuCache.data) {
      return res.status(404).json({ error: '메인 분석 결과가 없습니다. /mingyulist/refresh를 먼저 실행하세요.' });
    }

    var mainResult = mingyuCache.data;
    var mainRecs = mainResult.recommendations;

    // 미장 ETF 가격 변동 조회 (Yahoo Finance)
    var overnightETFs = [
      { symbol: 'SPY', name: 'S&P 500' },
      { symbol: 'QQQ', name: '나스닥 100' },
      { symbol: 'SOXX', name: '반도체' },
      { symbol: 'ARKK', name: '혁신성장' },
      { symbol: 'FXI', name: '중국' },
      { symbol: 'EWY', name: '한국' }
    ];

    var usQuotes = await fetchQuotes(overnightETFs);
    var usChanges = {};
    for (var i = 0; i < usQuotes.length; i++) {
      usChanges[usQuotes[i].ticker] = {
        price: usQuotes[i].price,
        change: parseFloat(usQuotes[i].change_percentage)
      };
    }

    // 섹터 → 미국 ETF 매핑 (보정용)
    var sectorToUS = {
      '미국나스닥': 'QQQ',
      '미국지수': 'SPY',
      '미국반도체': 'SOXX',
      '반도체': 'SOXX',
      'IT/플랫폼': 'QQQ',
      'IT/디지털': 'QQQ',
      '중국전기차': 'FXI',
      '국내지수': 'EWY',
      '혁신성장': 'ARKK',
      '2차전지': 'EWY',
      '2차전지소재': 'EWY',
      '배터리': 'EWY',
      '자동차': 'EWY',
      '인도': 'SPY'
    };

    // 메인 추천에 미장 보정 적용
    var adjustedRecs = mainRecs.map(function(rec) {
      var refETF = sectorToUS[rec.sector] || 'SPY';
      var usData = usChanges[refETF] || { change: 0 };
      var adjustment = 0;
      var signal = '';

      if (usData.change < -3) {
        adjustment = -10;
        signal = '🔴 미장 급락(' + refETF + ' ' + usData.change.toFixed(1) + '%) → 매수 대기 권장';
      } else if (usData.change < -1) {
        adjustment = -3;
        signal = '⚠️ 미장 약세(' + refETF + ' ' + usData.change.toFixed(1) + '%) → 비중 축소 고려';
      } else if (usData.change > 2) {
        adjustment = +8;
        signal = '🟢 미장 강세(' + refETF + ' +' + usData.change.toFixed(1) + '%) → 매수 강화';
      } else if (usData.change > 0.5) {
        adjustment = +3;
        signal = '📈 미장 소폭 상승(' + refETF + ' +' + usData.change.toFixed(1) + '%) → 계획대로 매수';
      } else {
        signal = '➡️ 미장 보합(' + refETF + ' ' + usData.change.toFixed(1) + '%) → 메인 추천 유지';
      }

      return {
        symbol: rec.symbol,
        name: rec.name,
        sector: rec.sector,
        main_score: rec.score,
        adjusted_score: Math.round((rec.score + adjustment) * 10) / 10,
        adjustment: adjustment,
        overnight_signal: signal,
        ref_etf: refETF,
        ref_change: usData.change
      };
    });

    // 보정 점수로 재정렬
    adjustedRecs.sort(function(a, b) { return b.adjusted_score - a.adjusted_score; });

    // 전체 시장 요약
    var spyChange = (usChanges['SPY'] || {}).change || 0;
    var qqqChange = (usChanges['QQQ'] || {}).change || 0;
    var marketSummary = '';
    if (spyChange < -2) marketSummary = '⛔ 미장 전반 급락 → 오늘 한국장 하방 압력 예상, 현금 비중 확대 고려';
    else if (spyChange < -0.5) marketSummary = '⚠️ 미장 약세 마감 → 한국장 초반 약세 가능, 분할매수 접근';
    else if (spyChange > 1.5) marketSummary = '🟢 미장 강세 마감 → 한국장 갭업 예상, 적극 매수 유리';
    else marketSummary = '➡️ 미장 보합 마감 → 메인 추천대로 실행';

    var overnightResult = {
      title: '🌙 민규의 Overnight 보정 리포트',
      type: 'overnight',
      main_generated_at: mainResult.generated_at,
      overnight_generated_at: new Date().toISOString(),
      market_summary: marketSummary,
      us_market: usChanges,
      adjusted_recommendations: adjustedRecs,
      note: '메인 추천(15:30)에 미장 결과를 반영한 보정입니다. 매수 실행 전 최종 참고용.'
    };

    // overnight 캐시 저장
    try {
      var overnightCacheFile = path.join(__dirname, '.mingyulist_overnight.json');
      fs.writeFileSync(overnightCacheFile, JSON.stringify({ data: overnightResult, timestamp: Date.now() }));
    } catch (e) {}

    res.json(overnightResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 주말 뉴스/리서치 갱신 (장 데이터 유지, 뉴스+리서치만 업데이트) =====
app.get('/mingyulist/weekend-update', async (req, res) => {
  try {
    if (!mingyuCache.data || !mingyuCache.data.recommendations) {
      return res.status(404).json({ error: '메인 캐시가 없습니다.' });
    }

    var recs = mingyuCache.data.recommendations;
    var updated = [];

    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      var newsUpdate = { score: 0, positive: 0, negative: 0 };
      var researchUpdate = { target_price: null, upside: null, score: 0 };
      var forumUpdate = { score: 0, sentiment: 'neutral' };
      var redditUpdate = { score: 0, mentions: 0, sentiment: 'neutral' };

      // 뉴스 갱신
      if (rec.type === 'kr_stock' || rec.type === 'kr_etf') {
        newsUpdate = await fetchNaverNews(rec.symbol);
      }

      // 리서치 갱신 (한국 주식만)
      if (rec.type === 'kr_stock') {
        var research = await fetchNaverResearch(rec.symbol);
        var resScore = calcResearchScore(research, rec.price);
        researchUpdate = { target_price: research.avgTarget, upside: resScore.upside, score: resScore.score };
        // 토론방 갱신
        forumUpdate = await fetchNaverForum(rec.symbol);
      }

      // Reddit 갱신
      var redditQuery = (rec.name.includes('KODEX') || rec.name.includes('TIGER')) ? rec.sector : rec.name;
      redditUpdate = await fetchRedditSentiment(redditQuery);

      updated.push({
        symbol: rec.symbol,
        name: rec.name,
        sector: rec.sector,
        price: rec.price,
        original_score: rec.score,
        news_update: newsUpdate,
        research_update: researchUpdate,
        forum_update: { score: forumUpdate.score, sentiment: forumUpdate.sentiment },
        reddit_update: { score: redditUpdate.score, mentions: redditUpdate.mentions, sentiment: redditUpdate.sentiment },
        weekend_note: newsUpdate.score >= 3 ? '📰 주말 뉴스 긍정적' :
                      newsUpdate.score <= -3 ? '📰 주말 뉴스 부정적 → 월요일 주의' :
                      forumUpdate.sentiment === 'bullish' ? '💬 커뮤니티 매수 심리 유지' :
                      forumUpdate.sentiment === 'bearish' ? '💬 커뮤니티 부정적 → 주의' : '주말 변동 없음'
      });
    }

    // 매크로 뉴스도 갱신
    var macro = await fetchMacroNews();

    var weekendResult = {
      title: '📅 주말 뉴스/리서치 업데이트',
      type: 'weekend_update',
      generated_at: new Date().toISOString(),
      macro_news: { sentiment: macro.sentiment, score: macro.score, headlines: macro.headlines },
      updated_items: updated,
      note: '장 데이터(가격/로테이션)는 금요일 기준 유지. 뉴스/리서치만 주말 반영.'
    };

    // overnight 캐시에 저장 (월요일 /mingyulist 호출 시 참조)
    try {
      var overnightCacheFile = path.join(__dirname, '.mingyulist_overnight.json');
      fs.writeFileSync(overnightCacheFile, JSON.stringify({ data: weekendResult, timestamp: Date.now() }));
    } catch (e) {}

    res.json(weekendResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== /report - 고정 URL 리포트 (텍스트) =====
app.get('/report', async (req, res) => {
  try {
    var lines = [];
    var divider = '════════════════════════════════════════════════════════════════';

    // 1. Watchlist
    var watchData = await fetchAllStocks();
    lines.push('', divider, '  📊 오늘의 주식 시장 요약', divider, '');
    lines.push('  생성: ' + (watchData.last_updated || 'N/A'));
    lines.push('', divider, '  📊 주요 지수', divider);
    for (var q of watchData.watchlist.main_index.quotes) {
      var arrow = q.change_percentage.startsWith('-') ? '▼' : '▲';
      lines.push('  ' + q.ticker.padEnd(8) + ' ' + q.desc.padEnd(18) + ' ' + q.price.padStart(10) + ' USD  ' + arrow + ' ' + q.change_percentage);
    }
    lines.push('', divider, '  🏭 섹터별 동향', divider);
    for (var q of watchData.watchlist.sector_etf.quotes) {
      var arrow = q.change_percentage.startsWith('-') ? '▼' : '▲';
      lines.push('  ' + q.ticker.padEnd(8) + ' ' + q.desc.padEnd(18) + ' ' + q.price.padStart(10) + ' USD  ' + arrow + ' ' + q.change_percentage);
    }
    lines.push('', divider, '  🌏 주요국 시장', divider);
    for (var q of watchData.watchlist.global_market.quotes) {
      var arrow = q.change_percentage.startsWith('-') ? '▼' : '▲';
      lines.push('  ' + q.ticker.padEnd(8) + ' ' + q.desc.padEnd(18) + ' ' + q.price.padStart(10) + ' USD  ' + arrow + ' ' + q.change_percentage);
    }

    // 2. 통합 추천 리포트 (추천 + overnight + 추이 분석을 한 곳에)
    var mgData = mingyuCache.data;
    var recs = (mgData && mgData.recommendations) ? mgData.recommendations : [];

    // overnight 데이터 로드
    var overnightData = null;
    try {
      var ovFile = path.join(__dirname, '.mingyulist_overnight.json');
      var ovSaved = JSON.parse(fs.readFileSync(ovFile, 'utf8'));
      if (ovSaved.timestamp && Date.now() - ovSaved.timestamp < ONE_DAY) overnightData = ovSaved.data;
    } catch (e) {}

    var overnightMap = {};
    if (overnightData && overnightData.adjusted_recommendations) {
      for (var ov of overnightData.adjusted_recommendations) {
        overnightMap[ov.symbol] = ov;
      }
    }

    // 백업 데이터에서 연속 추천일수 + 가격 추이 계산
    var backups = [];
    try {
      var bDir = path.join(__dirname, 'backups');
      var bFiles = fs.readdirSync(bDir).filter(function(f) { return f.startsWith('mingyulist_') && f.endsWith('.json'); });
      bFiles.sort().reverse();
      backups = bFiles.slice(0, 14).map(function(f) {
        try { return JSON.parse(fs.readFileSync(path.join(bDir, f), 'utf8')); }
        catch (e) { return null; }
      }).filter(Boolean);
    } catch (e) {}

    function getStreakInfo(symbol) {
      var streak = 0;
      var prices = [];
      for (var i = 0; i < backups.length; i++) {
        var found = (backups[i].recommendations || []).find(function(r) { return r.symbol === symbol; });
        if (found) {
          streak++;
          prices.push({ date: backups[i].date, price: found.price, score: found.score });
        } else {
          break;
        }
      }
      return { streak: streak, prices: prices };
    }

    if (recs.length > 0) {
      lines.push('', divider, '  [자동 알림] 오늘의 추천 요약', divider, '');

      // 시장 요약
      if (overnightData && overnightData.market_summary) {
        lines.push('  시장: ' + overnightData.market_summary);
        var us = overnightData.us_market || {};
        var usLine = [];
        for (var k of Object.keys(us)) {
          var v = us[k];
          var arrow = v.change >= 0 ? '+' : '';
          usLine.push(k + ' ' + arrow + v.change.toFixed(1) + '%');
        }
        lines.push('  미장: ' + usLine.join(' | '));
      } else {
        var ma = mgData.market_analysis || {};
        if (ma.context) lines.push('  시장: ' + ma.context);
      }
      lines.push('  생성: ' + (mgData.generated_at || '').slice(0, 16));

      // 환율/금리 표시
      var fxInfo = await fetchFxAndRates();
      if (fxInfo && fxInfo.usdkrw) {
        var fxParts = [];
        fxParts.push('USD/KRW ' + fxInfo.usdkrw.rate + ' (' + (fxInfo.usdkrw.change_pct >= 0 ? '+' : '') + fxInfo.usdkrw.change_pct + '%)');
        if (fxInfo.us10y) fxParts.push('US10Y ' + fxInfo.us10y.rate + '%');
        lines.push('  환율/금리: ' + fxParts.join(' | '));
      }

      lines.push('');

      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        var ov = overnightMap[r.symbol];

        // overnight 보정으로 매수 의미 없는 종목 필터링
        if (ov && ov.adjustment <= -10) continue;
        if (ov && ov.adjusted_score < 5) continue;

        var alloc = '';

        // 점수 표시
        var scorePart = '';
        if (ov) {
          var adj = ov.adjustment >= 0 ? '+' + ov.adjustment : String(ov.adjustment);
          scorePart = ' [' + ov.adjusted_score.toFixed(1) + '점, ' + adj + ']';
        } else {
          scorePart = ' [' + r.score.toFixed(1) + '점]';
        }

        // 연속 추천일수 + 추이
        var streakInfo = getStreakInfo(r.symbol);
        var trendLine = '';
        if (streakInfo.streak >= 2) {
          var oldPrice = streakInfo.prices[streakInfo.prices.length - 1].price;
          var curPrice = r.price;
          var trendPct = ((curPrice - oldPrice) / oldPrice * 100).toFixed(1);
          var trendArrow = parseFloat(trendPct) >= 0 ? '📈' : '📉';
          trendLine = '  ' + trendArrow + ' ' + streakInfo.streak + '일 연속 추천 (추이: ' + oldPrice.toLocaleString() + ' → ' + curPrice.toLocaleString() + ', ' + (parseFloat(trendPct) >= 0 ? '+' : '') + trendPct + '%)';
        }

        // 시그널 (overnight 있으면 overnight, 없으면 reason)
        var signal = '';
        if (ov && ov.overnight_signal) {
          signal = ov.overnight_signal;
        } else {
          signal = r.reason || '';
        }

        lines.push(r.name + ' (' + r.sector + ')' + scorePart);
        lines.push('  ' + signal);
        if (trendLine) lines.push(trendLine);

        // 점수 분해 (왜 이 점수인지 설명)
        var breakdown = [];
        var todayNum = parseFloat(r.today_change) || 0;
        var weekNum = parseFloat(r.week_change) || 0;
        if (todayNum < 0 || weekNum < 0) breakdown.push('가격모멘텀 ' + (r.phase1_score || '?'));
        if (r.news && r.news.score !== 0) breakdown.push('뉴스 ' + (r.news.score > 0 ? '+' : '') + (r.news.score * signalWeights.news));
        if (r.forum && r.forum.sentiment !== 'neutral') breakdown.push('커뮤니티 ' + (r.forum.sentiment === 'bullish' ? '+7' : '-5'));
        if (r.global_news && r.global_news.score !== 0) breakdown.push('글로벌 ' + (r.global_news.score > 0 ? '+' : '') + (r.global_news.score * signalWeights.global_news));
        if (r.research && r.research.score) breakdown.push('증권사 ' + (r.research.score > 0 ? '+' : '') + r.research.score);
        if (r.institutional && r.institutional.score !== 0) breakdown.push('수급 ' + (r.institutional.score > 0 ? '+' : '') + r.institutional.score);
        if (r.academic && r.academic.score !== 0) breakdown.push('학술 ' + (r.academic.score > 0 ? '+' : '') + r.academic.score);
        if (r.macro && r.macro.score !== 0) breakdown.push('매크로 ' + (r.macro.score > 0 ? '+' : '') + r.macro.score);
        if (r.valuation) {
          if (r.valuation.score !== 0) breakdown.push('밸류 ' + (r.valuation.score > 0 ? '+' : '') + r.valuation.score);
        }
        if (r.fx_rate && r.fx_rate.score !== 0) breakdown.push('환율 ' + (r.fx_rate.score > 0 ? '+' : '') + r.fx_rate.score);
        if (breakdown.length > 0) {
          lines.push('  📊 점수분해: ' + breakdown.join(' | '));
        }

        // 밸류에이션 정보 표시
        if (r.valuation && r.valuation.per) {
          var valParts = [];
          if (r.valuation.per) valParts.push('PER ' + r.valuation.per);
          if (r.valuation.pbr) valParts.push('PBR ' + r.valuation.pbr);
          if (r.valuation.roe) valParts.push('ROE ' + r.valuation.roe + '%');
          if (r.valuation.dividend_yield) valParts.push('배당 ' + r.valuation.dividend_yield + '%');
          if (valParts.length > 0) lines.push('  💰 ' + valParts.join(' | '));
        }

        lines.push('');
      }

      lines.push('  총 배분: ' + (mgData.total_allocated || ''));
    }

    // Footer
    lines.push(divider, '  Generated: ' + new Date().toISOString(), '  Server: api_server_paper:3000', divider, '');

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(500).set('Content-Type', 'text/plain').send('Error: ' + err.message);
  }
});

// ===== 일자별 백업 저장 시스템 =====
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function saveBackup(data) {
  try {
    var date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    var filename = 'mingyulist_' + date + '.json';
    var filepath = path.join(BACKUP_DIR, filename);
    var backupData = {
      date: date,
      generated_at: data.generated_at || new Date().toISOString(),
      recommendations: (data.recommendations || []).map(function(r) {
        return {
          symbol: r.symbol,
          name: r.name,
          sector: r.sector,
          type: r.type,
          price: r.price,
          score: r.score,
          today_change: r.today_change,
          week_change: r.week_change,
          news_score: r.news ? r.news.score : 0,
          forum_sentiment: r.forum ? r.forum.sentiment : 'neutral',
          global_news_score: r.global_news ? r.global_news.score : 0,
          reddit_sentiment: r.reddit ? r.reddit.sentiment : 'neutral',
          twitter_sentiment: r.twitter ? r.twitter.sentiment : 'neutral',
          research_score: r.research ? r.research.score : 0,
          research_upside: r.research ? r.research.upside : null,
          macro_score: r.macro ? r.macro.score : 0,
          academic_score: r.academic ? r.academic.score : 0,
          institutional_score: r.institutional ? r.institutional.score : 0,
          institutional_trend: r.institutional ? r.institutional.trend : 'neutral',
          rotation_effect: r.rotation_effect
        };
      }),
      market_analysis: data.market_analysis || null
    };
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));
    console.log('Backup saved:', filename);
    return filepath;
  } catch (e) {
    console.error('Backup save error:', e.message);
    return null;
  }
}

function loadBackups(days) {
  try {
    var files = fs.readdirSync(BACKUP_DIR).filter(function(f) { return f.startsWith('mingyulist_') && f.endsWith('.json'); });
    files.sort().reverse();
    if (days) files = files.slice(0, days);
    return files.map(function(f) {
      try { return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8')); }
      catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

// ===== 가중치 파일 (자기개선 결과 저장) =====
const WEIGHTS_FILE = path.join(__dirname, '.mingyulist_weights.json');
var signalWeights = {
  news: 3, forum: 2, global_news: 2, reddit: 1, twitter: 2,
  stocktwits: 1, research: 1, macro: 1, academic: 1, institutional: 1,
  rotation_bonus: 15, rotation_penalty: 0.4,
  hot_sector_bonus: 5, weight_multiplier: 20,
  updated_at: null, backtest_summary: null
};
try {
  var savedWeights = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
  if (savedWeights) { signalWeights = Object.assign(signalWeights, savedWeights); }
  console.log('Signal weights loaded:', savedWeights.updated_at || 'default');
} catch (e) {}

function saveWeights() {
  try { fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(signalWeights, null, 2)); } catch (e) {}
}

// ===== 백테스트 함수 =====
async function runBacktest() {
  var backups = loadBackups(60); // 최근 60일
  if (backups.length < 5) return { error: '백업 데이터 부족 (최소 5일 필요)', backups_found: backups.length };

  var results = [];
  var signalStats = {
    news_positive: { count: 0, total_return: 0 },
    news_negative: { count: 0, total_return: 0 },
    forum_bullish: { count: 0, total_return: 0 },
    forum_bearish: { count: 0, total_return: 0 },
    global_news_positive: { count: 0, total_return: 0 },
    global_news_negative: { count: 0, total_return: 0 },
    reddit_bullish: { count: 0, total_return: 0 },
    twitter_bullish: { count: 0, total_return: 0 },
    twitter_bearish: { count: 0, total_return: 0 },
    research_high_upside: { count: 0, total_return: 0 },
    institutional_buy: { count: 0, total_return: 0 },
    institutional_sell: { count: 0, total_return: 0 },
    rotation_inflow: { count: 0, total_return: 0 },
    rotation_outflow: { count: 0, total_return: 0 },
    academic_high: { count: 0, total_return: 0 },
    macro_positive: { count: 0, total_return: 0 },
    macro_negative: { count: 0, total_return: 0 },
    high_score: { count: 0, total_return: 0 },
    low_score: { count: 0, total_return: 0 }
  };

  // 각 백업의 추천 종목에 대해 3일 후 수익률 계산
  for (var i = 0; i < backups.length; i++) {
    var backup = backups[i];
    if (!backup.recommendations || !backup.recommendations.length) continue;

    for (var j = 0; j < backup.recommendations.length; j++) {
      var rec = backup.recommendations[j];
      if (!rec.price || !rec.symbol) continue;

      // 3일 후 가격 조회 (다음 백업에서 찾기)
      var futurePrice = null;
      for (var k = 0; k < backups.length; k++) {
        if (backups[k].date <= backup.date) continue;
        var daysDiff = Math.round((new Date(backups[k].date) - new Date(backup.date)) / (24*60*60*1000));
        if (daysDiff >= 2 && daysDiff <= 5) {
          var found = (backups[k].recommendations || []).find(function(r) { return r.symbol === rec.symbol; });
          if (found && found.price) { futurePrice = found.price; break; }
        }
      }

      // 백업에서 못 찾으면 실시간 API로 조회하지 않음 (야간이라 불필요)
      if (!futurePrice) continue;

      var returnPct = ((futurePrice - rec.price) / rec.price * 100);
      results.push({ symbol: rec.symbol, date: backup.date, recPrice: rec.price, futurePrice: futurePrice, returnPct: returnPct, score: rec.score });

      // 시그널별 수익률 추적
      if (rec.news_score >= 3) { signalStats.news_positive.count++; signalStats.news_positive.total_return += returnPct; }
      if (rec.news_score <= -3) { signalStats.news_negative.count++; signalStats.news_negative.total_return += returnPct; }
      if (rec.forum_sentiment === 'bullish') { signalStats.forum_bullish.count++; signalStats.forum_bullish.total_return += returnPct; }
      if (rec.forum_sentiment === 'bearish') { signalStats.forum_bearish.count++; signalStats.forum_bearish.total_return += returnPct; }
      if (rec.global_news_score >= 2) { signalStats.global_news_positive.count++; signalStats.global_news_positive.total_return += returnPct; }
      if (rec.global_news_score <= -2) { signalStats.global_news_negative.count++; signalStats.global_news_negative.total_return += returnPct; }
      if (rec.reddit_sentiment === 'bullish') { signalStats.reddit_bullish.count++; signalStats.reddit_bullish.total_return += returnPct; }
      if (rec.twitter_sentiment === 'bullish') { signalStats.twitter_bullish.count++; signalStats.twitter_bullish.total_return += returnPct; }
      if (rec.twitter_sentiment === 'bearish') { signalStats.twitter_bearish.count++; signalStats.twitter_bearish.total_return += returnPct; }
      if (rec.research_upside && rec.research_upside > 30) { signalStats.research_high_upside.count++; signalStats.research_high_upside.total_return += returnPct; }
      if (rec.institutional_trend === 'buy' || rec.institutional_trend === 'strong_buy') { signalStats.institutional_buy.count++; signalStats.institutional_buy.total_return += returnPct; }
      if (rec.institutional_trend === 'sell' || rec.institutional_trend === 'strong_sell') { signalStats.institutional_sell.count++; signalStats.institutional_sell.total_return += returnPct; }
      if (rec.rotation_effect && rec.rotation_effect.includes('유입')) { signalStats.rotation_inflow.count++; signalStats.rotation_inflow.total_return += returnPct; }
      if (rec.rotation_effect && rec.rotation_effect.includes('유출')) { signalStats.rotation_outflow.count++; signalStats.rotation_outflow.total_return += returnPct; }
      if (rec.academic_score >= 4) { signalStats.academic_high.count++; signalStats.academic_high.total_return += returnPct; }
      if (rec.macro_score >= 3) { signalStats.macro_positive.count++; signalStats.macro_positive.total_return += returnPct; }
      if (rec.macro_score <= -3) { signalStats.macro_negative.count++; signalStats.macro_negative.total_return += returnPct; }
      if (rec.score >= 35) { signalStats.high_score.count++; signalStats.high_score.total_return += returnPct; }
      if (rec.score < 20) { signalStats.low_score.count++; signalStats.low_score.total_return += returnPct; }
    }
  }

  // 평균 수익률 계산
  var signalPerformance = {};
  for (var key of Object.keys(signalStats)) {
    var stat = signalStats[key];
    signalPerformance[key] = {
      count: stat.count,
      avg_return: stat.count > 0 ? Math.round(stat.total_return / stat.count * 100) / 100 : 0,
      total_return: Math.round(stat.total_return * 100) / 100
    };
  }

  // 전체 포트폴리오 성과
  var totalTrades = results.length;
  var winners = results.filter(function(r) { return r.returnPct > 0; }).length;
  var avgReturn = totalTrades > 0 ? results.reduce(function(s, r) { return s + r.returnPct; }, 0) / totalTrades : 0;

  return {
    period: { from: backups[backups.length - 1].date, to: backups[0].date, days: backups.length },
    overall: {
      total_trades: totalTrades,
      win_rate: totalTrades > 0 ? Math.round(winners / totalTrades * 100) : 0,
      avg_return_pct: Math.round(avgReturn * 100) / 100,
      winners: winners,
      losers: totalTrades - winners
    },
    signal_performance: signalPerformance,
    recent_trades: results.slice(0, 20)
  };
}

// ===== 자기개선 함수 =====
function selfImprove(backtestResult) {
  if (!backtestResult || backtestResult.error) return { adjusted: false, reason: backtestResult ? backtestResult.error : 'no data' };

  var perf = backtestResult.signal_performance;
  var changes = [];
  var oldWeights = JSON.parse(JSON.stringify(signalWeights));

  // 각 시그널의 평균 수익률을 기반으로 가중치 조정
  // 양의 수익률 → 가중치 증가, 음의 수익률 → 가중치 감소
  // 최소 5건 이상 데이터가 있는 시그널만 조정

  // 뉴스 가중치
  if (perf.news_positive.count >= 5) {
    if (perf.news_positive.avg_return > 1) { signalWeights.news = Math.min(5, signalWeights.news + 0.5); changes.push('news +0.5 (긍정뉴스 수익↑)'); }
    else if (perf.news_positive.avg_return < -1) { signalWeights.news = Math.max(1, signalWeights.news - 0.5); changes.push('news -0.5 (긍정뉴스 수익↓)'); }
  }

  // 포럼 가중치
  if (perf.forum_bullish.count >= 5) {
    if (perf.forum_bullish.avg_return > 1) { signalWeights.forum = Math.min(4, signalWeights.forum + 0.5); changes.push('forum +0.5 (커뮤니티 적중↑)'); }
    else if (perf.forum_bullish.avg_return < -1) { signalWeights.forum = Math.max(0.5, signalWeights.forum - 0.5); changes.push('forum -0.5 (커뮤니티 적중↓)'); }
  }

  // 글로벌 뉴스 가중치
  if (perf.global_news_positive.count >= 5) {
    if (perf.global_news_positive.avg_return > 1) { signalWeights.global_news = Math.min(4, signalWeights.global_news + 0.5); changes.push('global_news +0.5'); }
    else if (perf.global_news_positive.avg_return < -1) { signalWeights.global_news = Math.max(0.5, signalWeights.global_news - 0.5); changes.push('global_news -0.5'); }
  }

  // 트위터 가중치
  if (perf.twitter_bullish.count >= 5) {
    if (perf.twitter_bullish.avg_return > 1.5) { signalWeights.twitter = Math.min(4, signalWeights.twitter + 0.5); changes.push('twitter +0.5 (트위터 적중↑)'); }
    else if (perf.twitter_bullish.avg_return < -1) { signalWeights.twitter = Math.max(0.5, signalWeights.twitter - 0.5); changes.push('twitter -0.5 (트위터 적중↓)'); }
  }

  // 증권사 리서치 가중치
  if (perf.research_high_upside.count >= 5) {
    if (perf.research_high_upside.avg_return > 2) { signalWeights.research = Math.min(2, signalWeights.research + 0.3); changes.push('research +0.3 (목표가 적중↑)'); }
    else if (perf.research_high_upside.avg_return < 0) { signalWeights.research = Math.max(0.3, signalWeights.research - 0.3); changes.push('research -0.3 (목표가 적중↓)'); }
  }

  // 기관/외국인 가중치
  if (perf.institutional_buy.count >= 5) {
    if (perf.institutional_buy.avg_return > 1.5) { signalWeights.institutional = Math.min(2, signalWeights.institutional + 0.3); changes.push('institutional +0.3 (수급 적중↑)'); }
    else if (perf.institutional_buy.avg_return < -0.5) { signalWeights.institutional = Math.max(0.5, signalWeights.institutional - 0.3); changes.push('institutional -0.3 (수급 적중↓)'); }
  }

  // 학술 트렌드 가중치
  if (perf.academic_high.count >= 5) {
    if (perf.academic_high.avg_return > 1) { signalWeights.academic = Math.min(2, signalWeights.academic + 0.3); changes.push('academic +0.3'); }
    else if (perf.academic_high.avg_return < -1) { signalWeights.academic = Math.max(0, signalWeights.academic - 0.3); changes.push('academic -0.3'); }
  }

  // 매크로 가중치
  if (perf.macro_positive.count >= 5) {
    if (perf.macro_positive.avg_return > 1) { signalWeights.macro = Math.min(2, signalWeights.macro + 0.3); changes.push('macro +0.3'); }
    else if (perf.macro_positive.avg_return < -1) { signalWeights.macro = Math.max(0.5, signalWeights.macro - 0.3); changes.push('macro -0.3'); }
  }

  // 로테이션 보너스/패널티 조정
  if (perf.rotation_inflow.count >= 3) {
    if (perf.rotation_inflow.avg_return > 2) { signalWeights.rotation_bonus = Math.min(20, signalWeights.rotation_bonus + 2); changes.push('rotation_bonus +2'); }
    else if (perf.rotation_inflow.avg_return < 0) { signalWeights.rotation_bonus = Math.max(5, signalWeights.rotation_bonus - 2); changes.push('rotation_bonus -2'); }
  }

  signalWeights.updated_at = new Date().toISOString();
  signalWeights.backtest_summary = {
    win_rate: backtestResult.overall.win_rate,
    avg_return: backtestResult.overall.avg_return_pct,
    total_trades: backtestResult.overall.total_trades,
    period: backtestResult.period
  };

  saveWeights();

  return {
    adjusted: changes.length > 0,
    changes: changes,
    old_weights: oldWeights,
    new_weights: signalWeights,
    backtest_win_rate: backtestResult.overall.win_rate + '%',
    backtest_avg_return: backtestResult.overall.avg_return_pct + '%'
  };
}

// ===== 백테스트 + 자기개선 엔드포인트 =====
app.get('/mingyulist/backtest', async (req, res) => {
  try {
    var backtestResult = await runBacktest();
    if (backtestResult.error) {
      return res.json({ title: '📊 백테스트 결과', status: 'insufficient_data', message: backtestResult.error, backups_found: backtestResult.backups_found });
    }

    var improveResult = selfImprove(backtestResult);

    res.json({
      title: '📊 야간 백테스트 + 자기개선 리포트',
      generated_at: new Date().toISOString(),
      backtest: backtestResult,
      self_improvement: improveResult,
      current_weights: signalWeights
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 백업 목록 조회
app.get('/mingyulist/backups', async (req, res) => {
  try {
    var backups = loadBackups();
    res.json({
      title: '📁 백업 데이터 목록',
      total: backups.length,
      dates: backups.map(function(b) { return b.date; }),
      latest: backups.length > 0 ? backups[0] : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 현재 가중치 조회
app.get('/mingyulist/weights', async (req, res) => {
  res.json({ title: '⚖️ 현재 시그널 가중치', weights: signalWeights });
});

app.listen(PORT, '0.0.0.0', () => console.log(`API server running on 0.0.0.0:${PORT}`));
