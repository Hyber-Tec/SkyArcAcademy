/**
 * The website's addresses (kept free of React, so the Vite config can read it too). English pages are at `/programs`,
 * Korean at `/ko/programs`, a news post at `/news/{slug}`. Every other address is the app's.
 */
export const PAGES = ['', 'programs', 'about', 'gallery', 'news', 'trial', 'contact', 'portal', 'get-app', 'privacy', 'terms', 'help'] as const
export type Page = (typeof PAGES)[number]

/** Whether an address is one of the website's pages (and not the app's). */
export function isSitePath(pathname: string): boolean {
  let parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'ko') parts = parts.slice(1)
  if (parts.length === 0) return true
  if (parts.length === 2 && parts[0] === 'news') return /^[a-z0-9-]+$/.test(parts[1])
  return parts.length === 1 && (PAGES as readonly string[]).includes(parts[0])
}

/**
 * Each page's title and description, for search engines and link previews (the built HTML of each page carries
 * them; the site keeps the tab's title current as people move around).
 */
export const PAGE_META: Record<Page | 'news-post', { en: { title: string; description: string }; ko: { title: string; description: string } }> = {
  '': {
    en: {
      title: 'Sky Arc Sports Academy · Youth air rifle in Suwanee, GA',
      description: 'Olympic-style 10 m air rifle training for young athletes in Suwanee, Georgia: safe instruction, strong fundamentals and a clear path from first shot to competition.',
    },
    ko: {
      title: 'Sky Arc Sports Academy · 조지아주 스와니 청소년 공기소총',
      description: '조지아주 스와니의 청소년 10m 공기소총 아카데미예요. 안전한 지도와 탄탄한 기본기로, 첫 발부터 대회까지 분명한 성장 경로를 함께해요.',
    },
  },
  programs: {
    en: { title: 'Programs & tuition · Sky Arc Sports Academy', description: 'Four program levels, from bench-supported first shots to Sporter and NCAA Precision competition. Placement by readiness, not school grade.' },
    ko: { title: '프로그램과 수강료 · Sky Arc Sports Academy', description: '벤치 지지대로 쏘는 첫 발부터 Sporter와 NCAA Precision 대회까지, 네 단계 프로그램이에요. 반은 학년이 아니라 준비 정도로 정해요.' },
  },
  about: {
    en: { title: 'About & coaches · Sky Arc Sports Academy', description: 'A youth development academy where technical excellence, personal growth and belonging share the same target. Meet the coaches.' },
    ko: { title: '소개와 코치진 · Sky Arc Sports Academy', description: '뛰어난 기술과 인격적 성장, 소속감을 같은 과녁에 두는 청소년 육성 아카데미예요. 코치진을 소개해요.' },
  },
  gallery: {
    en: { title: 'Gallery · Sky Arc Sports Academy', description: 'Practice, competition and the community behind every shot at Sky Arc Sports Academy.' },
    ko: { title: '갤러리 · Sky Arc Sports Academy', description: 'Sky Arc Sports Academy의 훈련과 대회, 그리고 한 발 한 발을 함께하는 사람들.' },
  },
  news: {
    en: { title: 'News · Sky Arc Sports Academy', description: 'Tournament results, competition updates and announcements from Sky Arc Sports Academy.' },
    ko: { title: '소식 · Sky Arc Sports Academy', description: 'Sky Arc Sports Academy의 대회 결과와 경기 소식, 공지를 전해요.' },
  },
  'news-post': {
    en: { title: 'News · Sky Arc Sports Academy', description: 'News from Sky Arc Sports Academy, a youth air rifle academy in Suwanee, Georgia.' },
    ko: { title: '소식 · Sky Arc Sports Academy', description: '조지아주 스와니의 청소년 공기소총 아카데미, Sky Arc Sports Academy 소식이에요.' },
  },
  trial: {
    en: { title: 'Book a trial · Sky Arc Sports Academy', description: 'Every athlete starts with Trial One: safety, range commands and the rifle, before any shooting. Request a time online.' },
    ko: { title: '체험 수업 신청 · Sky Arc Sports Academy', description: '모든 선수는 사격 전에 안전과 사대 구령, 총을 배우는 1차 체험부터 시작해요. 온라인으로 신청해 보세요.' },
  },
  contact: {
    en: { title: 'Contact · Sky Arc Sports Academy', description: 'Questions about programs, tuition, equipment or placement? Send a message to Sky Arc Sports Academy in Suwanee, GA.' },
    ko: { title: '문의 · Sky Arc Sports Academy', description: '프로그램, 수강료, 장비, 반 배정이 궁금하신가요? Sky Arc Sports Academy에 메시지를 보내 주세요.' },
  },
  'get-app': {
    en: { title: 'The Sky Arc app · Sky Arc Sports Academy', description: 'Classes, scores, progress reports and academy news on your iPhone or Android phone. Get Sky Arc on the App Store or Google Play.' },
    ko: { title: 'Sky Arc 앱 · Sky Arc Sports Academy', description: '수업, 점수, 성장 리포트, 아카데미 소식을 iPhone과 Android 휴대폰에서 확인해요. App Store나 Google Play에서 Sky Arc를 받아 보세요.' },
  },
  portal: {
    en: { title: 'Parent portal · Sky Arc Sports Academy', description: 'One login for class schedules, scores, progress reports and academy news.' },
    ko: { title: '학부모 포털 · Sky Arc Sports Academy', description: '한 번 로그인으로 수업 일정과 점수, 성장 리포트, 아카데미 소식을 확인해요.' },
  },
  privacy: {
    en: { title: 'Privacy Policy · Sky Arc Sports Academy', description: 'What Sky Arc Sports Academy keeps about families, students and staff on its website and phone app, why, who can see it, and your choices.' },
    ko: { title: '개인정보 처리방침 · Sky Arc Sports Academy', description: 'Sky Arc Sports Academy가 웹사이트와 앱에서 보관하는 정보, 보관하는 이유, 볼 수 있는 사람, 선택할 수 있는 것 (영어 원문).' },
  },
  terms: {
    en: { title: 'Terms of Service · Sky Arc Sports Academy', description: 'The rules for using the Sky Arc Sports Academy website and the Sky Arc phone app: accounts, trial requests, classes, safety and students’ records.' },
    ko: { title: '이용약관 · Sky Arc Sports Academy', description: 'Sky Arc Sports Academy 웹사이트와 Sky Arc 앱 이용약관: 계정, 체험 수업 신청, 수업, 안전, 학생 기록 (영어 원문).' },
  },
  help: {
    en: { title: 'Help · Sky Arc Sports Academy', description: 'Help with the Sky Arc Sports Academy website and the Sky Arc phone app: whom to ask, signing in, and deleting your account.' },
    ko: { title: '도움말 · Sky Arc Sports Academy', description: 'Sky Arc Sports Academy 웹사이트와 Sky Arc 앱 도움말이에요. 문의처, 로그인, 계정 삭제를 안내해요.' },
  },
}
