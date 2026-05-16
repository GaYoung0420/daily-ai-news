export const DISCORD_TAGS = {
  AI_NEWS: {
    label: "AI 뉴스",
    env: "DISCORD_TAG_AI_NEWS"
  },
  AI_CODING: {
    label: "AI코딩",
    env: "DISCORD_TAG_AI_CODING"
  },
  PROMPT_TIPS: {
    label: "프롬프트·활용팁",
    env: "DISCORD_TAG_PROMPT_TIPS"
  },
  AGENT_AUTOMATION: {
    label: "에이전트·자동화",
    env: "DISCORD_TAG_AGENT_AUTOMATION"
  },
  MODEL_SERVICE: {
    label: "모델·서비스",
    env: "DISCORD_TAG_MODEL_SERVICE"
  },
  BUSINESS_INVESTMENT: {
    label: "비즈니스·투자",
    env: "DISCORD_TAG_BUSINESS_INVESTMENT"
  },
  INFRA_SEMICONDUCTOR: {
    label: "인프라·반도체",
    env: "DISCORD_TAG_INFRA_SEMICONDUCTOR"
  },
  POLICY_REGULATION: {
    label: "정책·규제",
    env: "DISCORD_TAG_POLICY_REGULATION"
  },
  SECURITY_SAFETY: {
    label: "보안·안전",
    env: "DISCORD_TAG_SECURITY_SAFETY"
  },
  USE_CASE: {
    label: "활용사례",
    env: "DISCORD_TAG_USE_CASE"
  }
};

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_ANTHROPIC_TAG_MODEL = "claude-haiku-4-5-20251001";
const TAG_CLASSIFICATION_INPUT_LIMIT = 5000;

export const TAG_CLASSIFICATION_PROMPT = `
너는 AI 관련 게시물을 Discord 포럼 태그로 분류하는 편집자다.
입력으로 게시물 제목, 본문, 출처가 주어진다.
반드시 아래 허용 태그 중 하나만 선택한다.

중요한 규칙:
- 출력은 JSON 하나만 반환한다.
- 설명, 마크다운, 코드블록을 쓰지 않는다.
- tag 값은 허용 태그 이름과 정확히 일치해야 한다.
- 게시물 하나에는 태그를 1개만 붙인다.
- AI타임스 출처는 별도 로직에서 항상 "AI 뉴스"로 처리하므로, 이 프롬프트에서는 소셜/요즘IT 게시물만 분류한다고 가정한다.
- 여러 태그가 동시에 가능하면 "주된 독자가 이 게시물을 왜 읽는가"를 기준으로 고른다.

허용 태그와 상세 정의:

1. "프롬프트·활용팁"
- AI 도구를 더 잘 쓰는 방법, 명령어, 프롬프트 작성법, 설정법, 실전 팁, 워크플로우 팁에 붙인다.
- 특정 모델이나 코딩 도구가 언급되더라도 글의 핵심이 "어떻게 쓰면 좋은가"이면 이 태그를 우선한다.
- 예: 프롬프트 템플릿, Claude Code /goal 명령어 사용법, 슬래시 커맨드, settings.json 설정, 훅 사용법, ChatGPT 활용 팁, 업무 자동화 레시피.

2. "AI코딩"
- 개발, 코딩, 소프트웨어 엔지니어링, IDE, 코드 생성/수정/리뷰/디버깅, 개발자 도구에 붙인다.
- 글의 핵심이 개발 도구의 출시, 개발 생산성, 코딩 에이전트 자체의 기능이면 이 태그를 쓴다.
- 단, 명령어 사용법이나 실전 팁이 핵심이면 "프롬프트·활용팁"을 우선한다.
- 예: Codex, Claude Code, Grok Build, Cursor, GitHub Copilot, AI 코드 리뷰, 터미널 코딩 에이전트, 개발 자동화.

3. "에이전트·자동화"
- AI가 목표를 받아 여러 단계를 수행하거나, 도구를 호출하거나, 업무를 자동화하는 내용에 붙인다.
- 개인/조직의 업무 흐름, 반복 작업, 오피스 운영, 멀티스텝 실행, 자율 작업 주체가 핵심이면 이 태그다.
- 단, 코딩이 주된 맥락이면 "AI코딩"을 우선하고, 구체적 사용법이면 "프롬프트·활용팁"을 우선한다.
- 예: AI Agent, agentic workflow, Hermes Agent, AI Office, 업무 자동화, 멀티스텝 앱 자동화, 자율 실행 봇.

4. "모델·서비스"
- AI 모델, 제품, 서비스의 출시/업데이트/성능/기능/유출/비교에 붙인다.
- GPT, Claude, Gemini, Grok, Llama, Mistral, Sora, Seedance 등 모델이나 서비스 자체가 중심이면 이 태그다.
- 단, 기업 투자/실적이 핵심이면 "비즈니스·투자", 사용법이 핵심이면 "프롬프트·활용팁"을 우선한다.
- 예: 새 모델 출시, 영상 생성 모델, 음성 기능, 멀티모달 기능, 모델 성능 비교, 서비스 업데이트.

5. "비즈니스·투자"
- 기업 전략, 투자 유치, 인수합병, 상장, 주가, 실적, 파트너십, 시장 경쟁, 조직 변화에 붙인다.
- 기술 자체보다 회사의 움직임이나 시장 영향이 중심이면 이 태그다.
- 예: 시리즈 투자, 나스닥 상장, MOU, 매출, 인수, 파트너십, 빅테크 전략, 핵심 인력 이탈.

6. "인프라·반도체"
- AI를 구동하는 하드웨어와 인프라에 붙인다.
- GPU, NPU, 반도체, 데이터센터, 클라우드, 서버, 전력, 칩 공급망, AI 인프라 구축이 핵심이면 이 태그다.
- 예: 엔비디아 GPU, 국산 NPU, 데이터센터 전력, 클라우드 인프라, HBM, 반도체 파트너십.

7. "정책·규제"
- 정부, 법안, 규제, 소송, 국가 전략, 국제 협상, 저작권, 반독점, AI 거버넌스에 붙인다.
- 기술이나 기업 소식이라도 법적/정책적 판단과 규제 영향이 핵심이면 이 태그다.
- 예: AI 법안, 미국-중국 AI 협상, EU 규제, 소송, 저작권 분쟁, 정부 AI 전략, 보안 주권.

8. "보안·안전"
- 보안 취약점, 개인정보, 프라이버시, 악용 위험, AI safety, 딥페이크, 피싱, 탈옥, 데이터 유출에 붙인다.
- 사용자를 보호해야 하는 위험이나 안전성 이슈가 중심이면 이 태그다.
- 단, 정책 논의가 중심이면 "정책·규제"를 우선할 수 있다.
- 예: macOS 보안 우회, AI 안전성 평가, 개인정보 노출, 딥페이크 악용, jailbreak, 피싱 자동화.

9. "활용사례"
- 위 태그들에 명확히 들어가지 않는 실제 적용 사례, 산업별 활용, 마케팅/디자인/교육/의료/콘텐츠 제작 사례에 붙인다.
- 특정 도구의 사용법보다 "이런 분야에 AI를 적용했다"가 핵심이면 이 태그다.
- 애매하거나 일반적인 AI 활용 사례도 이 태그를 사용한다.
- 예: AI 광고제, 마케팅 자동화 사례, 디자인 결과물, 교육/의료 적용 사례, 개인 생산성 사례.

우선순위 가이드:
1. 사용법/팁/프롬프트/명령어가 핵심이면 "프롬프트·활용팁"
2. 코딩/개발 도구가 핵심이면 "AI코딩"
3. 자율 실행/업무 자동화가 핵심이면 "에이전트·자동화"
4. 모델/서비스 기능과 출시가 핵심이면 "모델·서비스"
5. 투자/기업/시장 이슈가 핵심이면 "비즈니스·투자"
6. 하드웨어/클라우드/전력/데이터센터가 핵심이면 "인프라·반도체"
7. 법/정부/규제/소송이 핵심이면 "정책·규제"
8. 보안/안전/프라이버시/악용 위험이 핵심이면 "보안·안전"
9. 그래도 애매하면 "활용사례"

반환 형식:
{"tag":"프롬프트·활용팁"}
`.trim();

const SOCIAL_TAG_LABEL_TO_KEY = Object.fromEntries(
  Object.entries(DISCORD_TAGS)
    .filter(([key]) => key !== "AI_NEWS")
    .map(([key, tag]) => [tag.label, key])
);

const SOCIAL_TAG_RULES = [
  {
    key: "PROMPT_TIPS",
    patterns: [
      /prompt|프롬프트|프롬프팅/i,
      /사용\s*법|사용법|활용\s*법|활용법|실전\s*팁|사용\s*팁|팁\b/i,
      /명령어|슬래시\s*커맨드|slash\s*command|\/goal|(^|\s)\/[a-z][\w-]*/i,
      /템플릿|체크리스트|설정\s*파일|settings\.json|훅\b|hook/i
    ]
  },
  {
    key: "AI_CODING",
    patterns: [
      /codex|코덱스/i,
      /claude\s*code|클로드\s*코드|클로드코드/i,
      /grok\s*build|그록\s*빌드/i,
      /github|깃허브/i,
      /\bide\b|vscode|cursor|커서/i,
      /코딩|프로그래밍|개발자|개발\s*도구|코드\s*생성|코드\s*리뷰|디버깅|리팩터/i
    ]
  },
  {
    key: "AGENT_AUTOMATION",
    patterns: [
      /agent|에이전트|agentic|에이전틱/i,
      /automation|자동화|자율|멀티스텝|multi[-\s]?step/i,
      /ai\s*office|오피스\s*ai|업무\s*자동화|반복\s*업무|워크플로우/i
    ]
  },
  {
    key: "MODEL_SERVICE",
    patterns: [
      /gpt|chatgpt|챗gpt|챗GPT|openai|오픈ai|오픈AI/i,
      /claude|클로드|anthropic|앤트로픽/i,
      /gemini|제미나이|google\s*ai|구글\s*ai/i,
      /grok|그록|xai|xAI/i,
      /llama|라마|mistral|미스트랄|sora|소라|seedance|시댄스|midjourney|미드저니/i,
      /모델|생성형|영상\s*ai|이미지\s*ai|음성\s*ai|멀티모달|출시|업데이트|유출/i
    ]
  },
  {
    key: "BUSINESS_INVESTMENT",
    patterns: [
      /투자|유치|시리즈[abc]?|상장|나스닥|주가|매출|실적/i,
      /인수|합병|m&a|파트너십|mou|계약|제휴/i,
      /기업\s*전략|사업\s*확대|시장|수익|비즈니스|스타트업/i
    ]
  },
  {
    key: "INFRA_SEMICONDUCTOR",
    patterns: [
      /\bgpu\b|\bnpu\b|tpu|반도체|칩|칩셋|hbm/i,
      /데이터\s*센터|데이터센터|클라우드|서버|인프라|전력|전력망/i,
      /엔비디아|nvidia|amd|cerebras|세레브라스|딥엑스/i
    ]
  },
  {
    key: "POLICY_REGULATION",
    patterns: [
      /정부|국회|백악관|법안|규제|정책|협상|국가\s*전략/i,
      /소송|재판|법적|저작권|독점|반독점|제재/i,
      /미국|중국|eu|유럽|안보|주권/i
    ]
  },
  {
    key: "SECURITY_SAFETY",
    patterns: [
      /보안|취약점|해킹|탈옥|jailbreak|프라이버시|개인정보/i,
      /안전|safety|위험|악용|피싱|사기|딥페이크|가짜뉴스/i,
      /유출|데이터\s*유출|보호|방어/i
    ]
  }
];

export function classifySocialTag(text) {
  const value = normalizeForClassification(text);

  for (const rule of SOCIAL_TAG_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(value))) {
      return rule.key;
    }
  }

  return "USE_CASE";
}

export async function classifySocialTagWithLlm({ title, text, source, env = process.env, fetchImpl = fetch }) {
  const fallbackTagKey = classifySocialTag(`${title}\n${text}`);
  const apiKey = String(env.ANTHROPIC_API_KEY || "").trim();

  if (!apiKey) {
    return {
      tagKey: fallbackTagKey,
      method: "rules",
      reason: "missing ANTHROPIC_API_KEY"
    };
  }

  try {
    const tagKey = await requestAnthropicTagClassification({
      apiKey,
      model: cleanModelName(env.ANTHROPIC_TAG_MODEL),
      title,
      text,
      source,
      fetchImpl
    });

    return {
      tagKey,
      method: "llm"
    };
  } catch (error) {
    return {
      tagKey: fallbackTagKey,
      method: "rules",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function tagLabel(tagKey) {
  return DISCORD_TAGS[tagKey]?.label ?? DISCORD_TAGS.USE_CASE.label;
}

export function discordTagId(tagKey, env = process.env) {
  const envName = DISCORD_TAGS[tagKey]?.env;
  return envName ? cleanTagId(env[envName]) : "";
}

export function buildForumWebhookFields({ title, tagKey, env = process.env, requireTag = false }) {
  const fields = {
    thread_name: truncateForumTitle(title)
  };
  const tagId = discordTagId(tagKey, env);

  if (tagId) {
    fields.applied_tags = [tagId];
  } else if (requireTag) {
    const tag = DISCORD_TAGS[tagKey];
    throw new Error(`Missing Discord forum tag id env ${tag?.env ?? tagKey} for #${tag?.label ?? tagKey}`);
  }

  return fields;
}

async function requestAnthropicTagClassification({ apiKey, model, title, text, source, fetchImpl }) {
  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 80,
      temperature: 0,
      system: TAG_CLASSIFICATION_PROMPT,
      messages: [
        {
          role: "user",
          content: buildTagClassificationInput({ title, text, source })
        }
      ]
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic returned ${response.status}: ${body.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    throw new Error(`Anthropic response was not JSON: ${error.message}`);
  }

  const outputText = extractAnthropicText(json);
  const tagLabel = parseTagLabel(outputText);
  const tagKey = SOCIAL_TAG_LABEL_TO_KEY[tagLabel];

  if (!tagKey) {
    throw new Error(`Anthropic returned unsupported tag: ${outputText.slice(0, 120)}`);
  }

  return tagKey;
}

function buildTagClassificationInput({ title, text, source }) {
  return truncateForClassification([
    `출처: ${source || "unknown"}`,
    `제목: ${title || ""}`,
    "본문:",
    text || ""
  ].join("\n"));
}

function extractAnthropicText(response) {
  return (Array.isArray(response?.content) ? response.content : [])
    .filter((block) => block?.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseTagLabel(outputText) {
  const text = String(outputText || "").trim();

  try {
    const parsed = JSON.parse(text);
    return String(parsed?.tag || "").trim();
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return String(parsed?.tag || "").trim();
    }
  }

  return text.replace(/^["']|["']$/g, "").trim();
}

function normalizeForClassification(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTagId(value) {
  return String(value || "")
    .trim()
    .replace(/^#/, "");
}

function cleanModelName(value) {
  return String(value || "").trim() || DEFAULT_ANTHROPIC_TAG_MODEL;
}

function truncateForumTitle(title) {
  const value = String(title || "AI 게시물").replace(/\s+/g, " ").trim();
  return value.length <= 100 ? value : value.slice(0, 99).trimEnd();
}

function truncateForClassification(text) {
  const value = String(text || "").trim();
  return value.length <= TAG_CLASSIFICATION_INPUT_LIMIT
    ? value
    : value.slice(0, TAG_CLASSIFICATION_INPUT_LIMIT).trimEnd();
}
