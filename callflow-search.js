// free5gc RAN<->Core call-flow 연구용 논문 검색기
// stock-advisor/server.js의 searchOpenAlex / invertedIndexToText 로직 재사용
const axios = require('axios');

// server.js와 동일한 abstract 복원 로직
function invertedIndexToText(idx) {
  if (!idx) return '';
  const words = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.join(' ');
}

// OpenAlex 호출 (relevance 정렬 - 검색어 관련성 우선)
async function searchOpenAlex(searchTerm, fromDate, toDate, perPage = 15) {
  try {
    const { data } = await axios.get('https://api.openalex.org/works', {
      params: {
        search: searchTerm,
        filter: `from_publication_date:${fromDate},to_publication_date:${toDate}`,
        sort: 'relevance_score:desc',
        per_page: perPage,
        select: 'id,doi,title,display_name,publication_date,cited_by_count,authorships,abstract_inverted_index,primary_topic,keywords,open_access,type'
      },
      timeout: 20000
    });
    return data.results || [];
  } catch (e) {
    console.error('search fail:', searchTerm, e.message);
    return [];
  }
}

// 5G 코어/셀룰러 도메인 관련성 판정 (무관한 고인용 논문 제거용)
const DOMAIN_TERMS = [
  '5g', '6g', 'cellular', 'mobile network', 'core network', 'ran',
  'gnb', 'gnodeb', 'enodeb', 'base station', 'amf', 'smf', 'upf', 'nrf',
  'nwdaf', 'pfcp', 'ngap', 'nas', 'pdu session', 'network slic',
  'service based architecture', 'free5gc', 'open5gs', 'ueransim',
  'network function', 'nfv', 'sdn', '3gpp', 'user plane', 'control plane',
  'registration procedure', 'signaling', 'signalling', 'handover',
  'kubernetes', 'container', 'microservice', 'cloud native', 'cloud-native',
  'observability', 'tracing', 'telemetry', 'packet core', 'lte', 'epc'
];
function domainScore(title, abstract, topic) {
  const text = ' ' + ((title || '') + ' ' + (abstract || '') + ' ' + (topic || '')).toLowerCase() + ' ';
  return DOMAIN_TERMS.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
}

// 주제 그룹: RAN<->Core 콜플로우 시각화/연구 베이스 & 리뷰
const QUERY_GROUPS = {
  callflow_signaling: [
    '5G NAS registration procedure AMF',
    '5G PDU session establishment SMF UPF',
    'PFCP N4 interface protocol 5G core',
    'NGAP N2 interface gNB AMF signaling',
    '5G service based architecture control plane procedure'
  ],
  survey_5gcore: [
    '5G core network architecture survey',
    'open source 5G core network free5GC Open5GS',
    'cloud native 5G core network survey',
    '5G network slicing survey core network'
  ],
  tracing_visualization: [
    '5G core network monitoring observability testbed',
    '5G signaling protocol analysis performance measurement',
    'network function virtualization performance monitoring 5G',
    '5G core network KPI latency measurement'
  ],
  ran_core_interaction: [
    'gNB AMF control plane latency 5G',
    'UERANSIM free5GC 5G core experimentation testbed',
    '5G RAN core network control plane performance',
    'containerized 5G core UPF data plane performance CNI'
  ]
};

const FROM = '2018-01-01';
const TO = '2026-12-31';

(async () => {
  const out = {};
  for (const [group, queries] of Object.entries(QUERY_GROUPS)) {
    const results = (await Promise.all(
      queries.map(q => searchOpenAlex(q, FROM, TO))
    )).flat();

    // id + title 중복 제거
    const seen = new Map();
    const seenTitles = new Set();
    for (const w of results) {
      const t = (w.display_name || w.title || '').toLowerCase().trim();
      if (!seen.has(w.id) && !seenTitles.has(t)) {
        seen.set(w.id, w);
        seenTitles.add(t);
      }
    }

    const papers = [...seen.values()]
      .map(w => {
        const abs = invertedIndexToText(w.abstract_inverted_index);
        const topic = w.primary_topic && w.primary_topic.display_name || '';
        return { w, abs, topic, dscore: domainScore(w.display_name || w.title, abs, topic) };
      })
      .filter(x => x.dscore >= 3)   // 5G/코어 도메인 용어 3개 이상만
      .sort((a, b) => (b.dscore * 100 + Math.log10((b.w.cited_by_count || 0) + 1) * 10)
                     - (a.dscore * 100 + Math.log10((a.w.cited_by_count || 0) + 1) * 10))
      .slice(0, 10)
      .map(({ w, abs, topic, dscore }) => ({
        title: w.display_name || w.title,
        doi: w.doi,
        type: w.type,
        publication_date: w.publication_date,
        cited_by_count: w.cited_by_count || 0,
        domain_score: dscore,
        authors: (w.authorships || []).slice(0, 4).map(a => a.author && a.author.display_name).filter(Boolean),
        topic: topic || null,
        abstract: abs.slice(0, 400),
        open_access: w.open_access && w.open_access.is_oa || false,
        url: w.id
      }));

    out[group] = papers;
    console.error(`[${group}] ${papers.length} papers`);
  }
  console.log(JSON.stringify(out, null, 2));
})();
