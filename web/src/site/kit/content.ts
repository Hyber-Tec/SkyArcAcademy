/**
 * The website's words, in English and Korean, taken from the academy's earlier site and tidied. Nothing here is
 * invented as a fact: what the academy hasn't confirmed yet (the trials' price and length, tuition, the youngest age)
 * is left out until it does, and photos still to come show a marked placeholder. What the academy changes itself comes
 * from the CRM's Website page instead (photos, coaches, testimonials, hours, Instagram, news; site/data.tsx), and its
 * email and phone from Settings → Academy. The Korean is a draft the owner reviews (docs/TODO.md).
 */
export type Lang = 'en' | 'ko'
export interface L {
  en: string
  ko: string
}
export const l = (en: string, ko: string): L => ({ en, ko })

/**
 * Keeps together what reads as one: a range ("Monday–Thursday", "250–275", "4:30–8 PM") and a hyphenated word
 * ("hands-on"), with a word joiner after the dash; a dash never starting a line ("sport—from"); and names that are one
 * name ("Sky Arc", "Marine Corps", "Junior Olympic"), with a no-break space.
 */
export const keepWhole = (s: string) =>
  s
    .replace(/([\p{L}\p{N}][–-])(?=[\p{L}\p{N}])/gu, '$1\u2060')
    .replace(/([\p{L}\p{N}.,])—/gu, '$1\u2060—')
    .replace(/\b(Sky Arc|Marine Corps|Junior Olympic)\b/g, (m) => m.replace(' ', '\u00a0'))

export const ACADEMY = {
  name: 'Sky Arc Sports Academy',
  short: 'Sky Arc',
  location: l('Suwanee, Georgia', '조지아주 스와니'),
  street: '730 Peachtree Industrial Blvd',
  city: 'Suwanee, GA 30024',
  /** The app's sign-in page (the parent portal). */
  loginUrl: '/login',
}

export const LANG_NAMES: Record<Lang, string> = { en: 'English', ko: '한국어' }

export const UI = {
  home: l('Home', '홈'),
  programs: l('Programs', '프로그램'),
  about: l('About', '소개'),
  coaches: l('Coaches', '코치진'),
  gallery: l('Gallery', '갤러리'),
  news: l('News', '소식'),
  tuition: l('Tuition', '수강료'),
  contact: l('Contact', '문의'),
  trial: l('Book a trial', '체험 수업 신청'),
  trialShort: l('Book trial', '체험 신청'),
  login: l('Log in', '로그인'),
  openApp: l('Open the app', '앱 열기'),
  parentLogin: l('Parent login', '학부모 로그인'),
  portal: l('Parent portal', '학부모 포털'),
  menu: l('Menu', '메뉴'),
  close: l('Close', '닫기'),
  language: l('Language', '언어'),
  skipIntro: l('Skip intro', '인트로 건너뛰기'),
  readMore: l('Read more', '더 보기'),
  viewAll: l('View all', '전체 보기'),
  allNews: l('All news', '소식 전체 보기'),
  seeGallery: l('See the gallery', '갤러리 보기'),
  explorePrograms: l('Explore programs', '프로그램 살펴보기'),
  learnMore: l('Learn more', '자세히 보기'),
  meetCoaches: l('Meet the coaches', '코치진 소개'),
  directions: l('Get directions', '길찾기'),
  backHome: l('Back to home', '홈으로'),
  back: l('Back', '이전'),
  next: l('Next', '다음'),
  previous: l('Previous', '이전'),
  placeholder: l('Placeholder', '임시'),
  photoNeeded: l('Photo needed', '사진 준비 중'),
  email: l('Email', '이메일'),
  phone: l('Phone', '전화번호'),
  address: l('Address', '주소'),
  hours: l('Hours', '운영 시간'),
  followUs: l('Follow us', '팔로우'),
  minutes: l('min', '분'),
}

export const HOME = {
  hero: {
    eyebrow: l('Youth air rifle academy · Suwanee, Georgia', '청소년 공기소총 아카데미 · 조지아주 스와니'),
    title: [l('Focus', '집중이'), l('takes flight.', '날아오르는 곳')],
    lead: l(
      'We develop calm, capable athletes through safe instruction, strong fundamentals, and a clear path from first shot to competition.',
      '안전한 지도와 탄탄한 기본기, 첫 발부터 대회까지 이어지는 분명한 성장 경로로 침착하고 실력 있는 선수를 키워요.',
    ),
  },
  /** Facts from their own site only. SIUS (the scoring system the academy uses) shows as its own logo. */
  facts: [
    { value: '10m', label: l('Olympic-style air rifle', '올림픽 종목 공기소총') },
    { value: '4', label: l('levels, from first shot to competition', '단계 · 첫 발부터 대회까지') },
    { value: '1:1', label: l('individual development focus', '선수마다 맞춘 성장 지도') },
    { value: 'SIUS', label: l('live electronic scoring', '실시간 전자 채점'), logo: true },
  ] as { value: string; label: L; logo?: boolean }[],
  standard: {
    eyebrow: l('The Sky Arc standard', 'Sky Arc의 기준'),
    steps: [l('Prepare', '준비'), l('Execute', '실행'), l('Call', '예측')],
    quote: l('Discipline creates confidence.', '절제가 자신감을 만들어요.'),
  },
  method: {
    eyebrow: l('Our method', '지도 방식'),
    title: l('More than a score.', '점수, 그 이상'),
    text: l(
      'We coach the athlete behind the rifle. Technical skill matters—and so do patience, accountability, decision-making, and resilience.',
      '저희는 총을 든 선수, 그 사람을 가르쳐요. 기술도 중요하지만 인내와 책임감, 판단력, 회복탄력성도 그만큼 중요해요.',
    ),
    items: [
      { title: l('Safe', '안전'), text: l('Clear commands. Controlled movement. Respect for every rifle and every person on the range.', '분명한 구령, 절제된 움직임. 사대의 모든 총과 모든 사람을 존중해요.') },
      { title: l('Steady', '안정'), text: l('Strong fundamentals before speed. Athletes learn how to create a reliable shot process.', '속도보다 기본기가 먼저예요. 믿고 반복할 수 있는 사격 과정을 스스로 만드는 법을 배워요.') },
      { title: l('Self-aware', '스스로 돌아보기'), text: l('Call the shot, study the result, and make the next adjustment with purpose.', '쏜 자리를 먼저 예측하고, 결과를 살펴보고, 다음 발을 목적 있게 고쳐 나가요.') },
    ],
  },
  known: {
    eyebrow: l('Built for the long term', '오래 가는 성장'),
    title: l('Every athlete. Known by name.', '선수 한 명 한 명을 알고 가르쳐요'),
    text: l(
      'Sky Arc uses observation, coaching notes, and performance records to understand each athlete’s strengths and areas for growth. That insight shapes an individualized training plan built for lasting progress—not short-term scores.',
      'Sky Arc는 관찰과 코칭 노트, 경기 기록으로 선수마다 잘하는 점과 더 키울 점을 파악해요. 그걸 바탕으로 당장의 점수가 아니라 오래 가는 성장을 위한 개인 훈련 계획을 세워요.',
    ),
    points: [
      l('Fundamentals-first coaching', '기본기부터 다지는 코칭'),
      l('Individual progress tracking', '선수별 성장 기록'),
      l('Positive, disciplined culture', '긍정적이고 규율 있는 분위기'),
      l('Competition-ready pathways', '대회로 이어지는 성장 경로'),
    ],
  },
  safety: {
    eyebrow: l('Safety first', '무엇보다 안전'),
    title: l('Safe before the first shot.', '첫 발을 쏘기 전에, 안전부터'),
    text: l(
      'Air rifle is a precise, controlled sport, and it is taught that way. Safety habits come before anything else.',
      '공기소총은 정밀하고 절제된 스포츠라서, 가르칠 때도 그렇게 가르쳐요. 무엇보다 안전 습관이 먼저예요.',
    ),
    items: [
      {
        title: l('Safety before shooting', '사격 전 안전 교육'),
        text: l(
          'Every new athlete starts with Trial One: core safety rules, range commands and how a safe session flows. No one shoots in Trial One.',
          '처음 오는 선수는 모두 1차 체험부터 시작해요. 기본 안전 수칙과 사대 구령, 안전하게 수업하는 흐름을 배우고, 1차 체험에서는 아무도 사격하지 않아요.',
        ),
      },
      {
        title: l('Clear commands', '분명한 구령'),
        text: l(
          'Clear commands and controlled movement on the range. Every command, movement and equipment habit begins with respect for the people around you.',
          '사대에서는 분명한 구령과 절제된 움직임을 지켜요. 구령 하나, 동작 하나, 장비를 다루는 습관까지 모두 주변 사람을 존중하는 데서 시작해요.',
        ),
      },
      {
        title: l('Ready before anyone shoots', '모두 준비된 뒤에 사격해요'),
        text: l(
          'Coaches review the safety rules and confirm that every athlete is ready before anyone shoots.',
          '사격을 시작하기 전에 코치가 안전 수칙을 다시 짚고, 선수 모두가 준비됐는지 확인해요.',
        ),
      },
      {
        title: l('A team that knows the range', '사대를 잘 아는 코치진'),
        text: l(
          'Our coaches include NRA-certified instructors and Marine Corps veterans who oversee safety protocols and equipment readiness.',
          '코치진에는 NRA 공인 지도자와 미 해병대 출신 코치가 있어서, 안전 절차와 장비 상태를 꼼꼼히 관리해요.',
        ),
      },
    ],
  },
  path: {
    eyebrow: l('The path', '성장 경로'),
    title: l('Grow with every shot.', '한 발 한 발, 성장해요'),
    text: l(
      'Placement is led by demonstrated skill, safety, and readiness—not school grade. Age helps coaches choose positions an athlete can handle safely, but it does not create a rigid program boundary.',
      '반 배정은 학년이 아니라 실제로 보여 준 실력과 안전 습관, 준비 정도로 정해요. 나이는 선수가 안전하게 소화할 수 있는 자세를 고를 때 참고할 뿐, 넘을 수 없는 경계는 아니에요.',
    ),
    evaluations: l(
      'Formal evaluations each quarter. Coaches may recommend an earlier evaluation when skill, safety, and physical readiness support the next position.',
      '정식 평가는 분기마다 있어요. 실력과 안전, 신체 준비가 다음 자세에 맞을 만큼 갖춰지면 코치가 평가를 앞당기자고 권할 수 있어요.',
    ),
    advance: l('Advance when ready', '준비되면 다음 단계로'),
    illustration: l('Illustration: a shot group tightening from level to level.', '그림: 단계가 올라갈수록 탄착군이 모여요.'),
  },
  launchpad: {
    eyebrow: l('Supported Launchpad', '지지대로 시작하는 Launchpad'),
    title: l('More options. More engagement.', '선택은 넓게, 몰입은 깊게'),
    text: l(
      'New athletes—and especially younger athletes who are not yet physically ready for unsupported positions—benefit from bench support, shorter feedback loops, and flexible scheduling.',
      '처음 시작하는 선수, 특히 아직 지지대 없이 자세를 잡기 힘든 어린 선수에게는 벤치 지지대와 짧은 피드백 주기, 유연한 일정이 도움이 돼요.',
    ),
    items: [
      {
        tag: l('Flexible attendance', '유연한 출석'),
        title: l('Fit training into family life', '가족 일정에 맞춰 훈련해요'),
        text: l('Multiple Launchpad opportunities give families more ways to maintain consistent training without forcing one rigid weekly time.', 'Launchpad 수업이 여러 번 있어서, 매주 같은 시간에 매이지 않고도 꾸준히 훈련할 수 있어요.'),
      },
      {
        tag: l('Supported fundamentals', '지지대 위 기본기'),
        title: l('Build the shot process', '사격 과정 익히기'),
        text: l('Engaging work on safety, sight picture, breathing, trigger feel, follow-through, and calling the shot before positional demands increase.', '자세가 어려워지기 전에 안전, 조준, 호흡, 방아쇠 감각, 팔로스루, 탄착 예측을 재미있게 익혀요.'),
      },
      {
        tag: l('Quarterly or sooner', '분기마다, 또는 더 일찍'),
        title: l('Advance when ready', '준비되면 다음 단계로'),
        text: l('Formal evaluations occur each quarter. Coaches may recommend an earlier evaluation when skill, safety, and physical readiness support the next position.', '정식 평가는 분기마다 있어요. 실력과 안전, 신체 준비가 다음 자세에 맞을 만큼 갖춰지면 코치가 평가를 앞당기자고 권할 수 있어요.'),
      },
    ],
  },
  report: {
    eyebrow: l('For parents', '학부모님께'),
    title: l('See every step of their progress.', '아이의 성장을 한 걸음 한 걸음 지켜보세요'),
    text: l(
      'Families sign in to the Sky Arc portal to see class schedules, scores and progress reports: how the scores moved, where the shots went, what is going well and what comes next, with a note from the coach.',
      '학부모님은 Sky Arc 포털에 로그인해서 수업 일정과 점수, 성장 리포트를 볼 수 있어요. 점수가 어떻게 변했는지, 탄착이 어디에 맞았는지, 잘하고 있는 점과 다음 목표, 그리고 코치의 한마디까지 담겨 있어요.',
    ),
    features: [
      { title: l('Scores over time', '점수 변화'), text: l('Every evaluation, charted across the period.', '기간 동안의 모든 평가를 그래프로 보여 줘요.') },
      { title: l('Shot by shot', '한 발 한 발'), text: l('Replay where each shot landed on the target.', '한 발 한 발이 표적 어디에 맞았는지 다시 볼 수 있어요.') },
      { title: l('Coach notes and goals', '코치 노트와 목표'), text: l('Strengths, focus areas and goals for the next period.', '잘하는 점, 집중할 점, 다음 기간의 목표.') },
      { title: l('Schedules and news', '일정과 소식'), text: l('Classes, changes and academy news in one place.', '수업과 바뀐 일정, 아카데미 소식을 한곳에서 확인해요.') },
    ],
    sampleNote: l('Sample report: a made-up athlete and made-up scores.', '샘플 리포트예요. 선수와 점수는 가상이에요.'),
  },
  coaches: {
    eyebrow: l('Meet the team', '코치진 소개'),
    title: l('Experience that shapes every athlete.', '선수를 키우는 경험'),
    text: l(
      'Sky Arc brings together competition experience, certified instruction, military leadership, athlete development, and disciplined facility operations.',
      'Sky Arc에는 대회 경험과 공인 지도 자격, 군에서 쌓은 리더십, 선수 육성 경험, 체계적인 시설 운영 노하우가 모여 있어요.',
    ),
  },
  trial: {
    eyebrow: l('Your first visit', '첫 방문'),
    title: l('Start with the basics.', '기본부터 시작해요'),
    text: l(
      'Every athlete begins with Trial One—safety, range procedures and the rifle itself—before the longer, hands-on Trial Two.',
      '모든 선수는 1차 체험에서 안전과 사대 절차, 총을 먼저 배운 뒤, 직접 쏴 보는 더 긴 2차 체험으로 넘어가요.',
    ),
    steps: [
      { title: l('Request Trial One online', '1차 체험 온라인 신청'), text: l('Tell us the days that suit your family; we’ll confirm a time.', '편한 요일을 알려 주시면 시간을 정해 드려요.') },
      { title: l('Trial One', '1차 체험'), text: l('Safety, commands and rifle orientation. No shooting yet.', '안전 수칙과 구령, 총 다루는 법 안내. 아직 사격은 하지 않아요.') },
      { title: l('Trial Two', '2차 체험'), text: l('A longer session: setup, then your first coached shots.', '더 긴 수업이에요. 장비를 갖춘 뒤 코치와 함께 첫 사격을 해요.') },
      { title: l('Join a program', '프로그램 등록'), text: l('Placement by coach evaluation, not school grade.', '반은 학년이 아니라 코치 평가로 정해요.') },
    ],
    bringTitle: l('Before you come', '오기 전에 확인하세요'),
    bring: [
      l('Arrive ten minutes early.', '10분 일찍 와 주세요.'),
      l('Wear comfortable clothing and closed-toe shoes.', '편한 옷에 앞이 막힌 신발을 신고 오세요.'),
      l('Equipment guidance is provided.', '장비는 아카데미에서 안내해 드려요.'),
    ],
  },
  news: {
    eyebrow: l('Stay current', '새 소식'),
    title: l('The latest at Sky Arc.', 'Sky Arc의 최근 소식'),
    text: l('Tournament results, competition updates and announcements from the academy.', '대회 결과와 경기 소식, 아카데미 공지를 전해요.'),
  },
  gallery: {
    eyebrow: l('Inside the academy', '아카데미 풍경'),
    title: l('Training in focus.', '집중하는 훈련의 순간'),
    text: l('Practice, competition and the community behind every shot.', '연습과 대회, 그리고 한 발 한 발을 함께하는 사람들.'),
  },
  testimonials: {
    eyebrow: l('Families', '학부모 후기'),
    title: l('What families say.', '학부모님들의 이야기'),
    text: l('Real words from Sky Arc families, shared with their permission.', 'Sky Arc 학부모님들의 실제 후기예요. 동의를 받고 싣고 있어요.'),
  },
  faq: {
    eyebrow: l('Questions', '자주 묻는 질문'),
    title: l('Good to know.', '알아 두면 좋아요'),
  },
  hours: {
    eyebrow: l('Academy hours', '운영 시간'),
    title: l('Plan your training.', '훈련 일정을 세워 보세요'),
    text: l('Regular weekday training hours, with flexible weekend access by arrangement.', '평일에는 정규 훈련 시간이 있고, 주말에는 예약하면 유연하게 이용할 수 있어요.'),
  },
  final: {
    eyebrow: l('The first shot starts here.', '첫 발은 여기서 시작돼요'),
    title: l('Ready to find your focus?', '집중을 찾을 준비가 되셨나요?'),
    text: l('Request Trial One online, or send us a question first.', '1차 체험을 온라인으로 신청하거나, 궁금한 점부터 먼저 물어보세요.'),
  },
}

export interface Rank {
  name: L
  range: L
  track?: L
}

export interface Level {
  id: 'launchpad' | 'foundations' | 'development' | 'performance'
  name: L
  stage: L
  headline: L
  text: L
  description: L
  focus: L[]
  experience: L[]
  includes: L[]
  ranks: Rank[]
}

export const LEVELS: Level[] = [
  {
    id: 'launchpad',
    name: l('Launchpad', 'Launchpad'),
    stage: l('Supported start', '지지대 입문'),
    headline: l('Learn the shot from the bench.', '벤치 지지대에서 사격을 배워요'),
    text: l(
      'New athletes build safety habits and an engaging bench-supported shot process before moving into more demanding positions.',
      '더 어려운 자세로 넘어가기 전에, 벤치 지지대로 쏘는 사격 과정과 안전 습관을 재미있게 익혀요.',
    ),
    description: l(
      'A welcoming first step where new athletes learn to enjoy the sport while building safe, responsible habits and a repeatable shot process.',
      '처음 온 선수가 안전하고 책임감 있는 습관과 반복할 수 있는 사격 과정을 익히면서, 이 스포츠의 재미를 알아 가는 첫걸음이에요.',
    ),
    focus: [
      l('Range safety, handling, and responsibility', '사대 안전, 총기 취급, 책임감'),
      l('Position, sight alignment, breathing, and trigger basics', '자세, 조준선 정렬, 호흡, 격발 기초'),
      l('Confidence through early, earned progress', '스스로 이뤄 낸 첫 성장에서 얻는 자신감'),
    ],
    experience: [
      l('Structured group coaching Monday–Thursday', '월~목 체계적인 그룹 코칭'),
      l('Consistent coaches and weekly skill-building', '늘 같은 코치진과 매주 쌓아 가는 기술'),
      l('Individual practice and private coaching available Friday–Sunday', '금~일 개인 연습과 개인 레슨 가능'),
    ],
    includes: [
      l('Safety and equipment orientation', '안전·장비 오리엔테이션'),
      l('Bench-supported first shots', '벤치 지지대로 쏘는 첫 사격'),
      l('Flexible attendance options', '유연한 출석 선택'),
      l('Readiness-based evaluations', '준비 정도에 따른 평가'),
    ],
    ranks: [{ name: l('Scout', 'Scout'), range: l('Entry & foundation', '입문·기초') }],
  },
  {
    id: 'foundations',
    name: l('Foundations', 'Foundations'),
    stage: l('Beginner', '초급'),
    headline: l('Safety becomes instinct.', '안전이 몸에 배요'),
    text: l(
      'Athletes develop range awareness, equipment care, body control, and a reliable foundation for confident first shots.',
      '사대 감각과 장비 관리, 몸의 균형, 자신 있게 첫 발을 쏘기 위한 탄탄한 기초를 길러요.',
    ),
    description: l(
      'Athletes strengthen their fundamentals, learn to evaluate their own technique, and turn a good shot into a repeatable process.',
      '기본기를 다지고, 자기 기술을 스스로 평가하는 법을 배우며, 좋은 한 발을 반복할 수 있는 과정으로 만들어요.',
    ),
    focus: [
      l('Stable position and natural point of aim', '안정된 자세와 자연 조준점'),
      l('Sight alignment, breath control, and trigger control', '조준선 정렬, 호흡 조절, 격발 조절'),
      l('The Commit · Execute · Accept mental process', '결심 · 실행 · 수용의 멘탈 루틴'),
    ],
    experience: [
      l('Weekly group coaching with progressive skill goals', '단계별 목표를 세운 매주 그룹 코칭'),
      l('Electronic scoring and performance-history review', '전자 채점과 기록 리뷰'),
      l('Coaching targeted to each athlete’s strengths and needs', '선수마다 강점과 필요에 맞춘 코칭'),
    ],
    includes: [
      l('Reliable bench shot process', '안정적인 벤치 사격 과정'),
      l('Sight and trigger fundamentals', '조준과 격발 기본기'),
      l('Coach-guided position introduction', '코치와 함께 배우는 자세 입문'),
      l('Individual progress check-ins', '개인별 성장 점검'),
    ],
    ranks: [
      { name: l('Hunter Jr.', 'Hunter Jr.'), range: l('150–175', '150–175') },
      { name: l('Hunter', 'Hunter'), range: l('175–200', '175–200') },
    ],
  },
  {
    id: 'development',
    name: l('Development', 'Development'),
    stage: l('Intermediate', '중급'),
    headline: l('Build a repeatable process.', '반복할 수 있는 과정을 만들어요'),
    text: l(
      'Athletes sharpen position, natural point of aim, sight alignment, breathing, trigger control, and follow-through.',
      '자세와 자연 조준점, 조준선 정렬, 호흡, 격발 조절, 팔로스루를 다듬어요.',
    ),
    description: l(
      'A development stage for more independent athletes refining precision, shot control, and competition-ready routines.',
      '더 독립적인 선수가 정밀도와 사격 조절, 대회에 맞는 루틴을 다듬는 단계예요.',
    ),
    focus: [
      l('Precision, consistency, and purposeful adjustment', '정밀도, 꾸준함, 목적 있는 조정'),
      l('Performance journaling and goal setting', '훈련 일지와 목표 세우기'),
      l('Preparation for postal, CMP, and school competition', '우편 대회, CMP, 학교 대회 준비'),
    ],
    experience: [
      l('Individualized training informed by SIUS target data', 'SIUS 표적 데이터를 보고 짜는 개인 훈련'),
      l('Regular progress reviews and readiness markers', '정기적인 성장 점검과 준비도 지표'),
      l('Opportunities to develop under match conditions', '실전 같은 조건에서 실력을 키울 기회'),
    ],
    includes: [
      l('Independent shot process', '스스로 완성하는 사격 과정'),
      l('Multi-position development', '여러 자세 훈련'),
      l('Structured skill drills', '체계적인 기술 훈련'),
      l('Individual performance notes', '개인별 경기력 노트'),
    ],
    ranks: [
      { name: l('Marksman Jr.', 'Marksman Jr.'), range: l('200–225', '200–225') },
      { name: l('Marksman', 'Marksman'), range: l('225–250', '225–250') },
    ],
  },
  {
    id: 'performance',
    name: l('Performance', 'Performance'),
    stage: l('Advanced', '고급'),
    headline: l('Train to compete.', '대회를 위해 훈련해요'),
    text: l(
      'Goal-based practice, match preparation, performance tracking, mental routines, and leadership for serious competitors.',
      '진지하게 대회를 준비하는 선수를 위한 목표 중심 연습, 경기 준비, 기록 관리, 멘탈 루틴, 리더십.',
    ),
    description: l(
      'Advanced athletes build performance under pressure, deepen competition experience, and follow the equipment pathway that fits their goals.',
      '상위 선수는 긴장되는 순간에도 실력을 내는 법을 익히고, 대회 경험을 넓히며, 목표에 맞는 장비 트랙을 따라가요.',
    ),
    focus: [
      l('Competition readiness and advanced performance', '대회 준비와 상위 경기력'),
      l('Mental preparation, leadership, and mentorship', '멘탈 준비, 리더십, 멘토링'),
      l('National-stage and collegiate pathway development', '전국 대회와 대학 진학 경로'),
    ],
    experience: [
      l('Sporter pathway: Sharpshooter and Expert', 'Sporter 트랙: Sharpshooter, Expert'),
      l('Precision pathway: NCAA Precision', 'Precision 트랙: NCAA Precision'),
      l('Coach evaluation includes consistency and attitude', '코치 평가에 꾸준함과 태도도 들어가요'),
    ],
    includes: [
      l('Competition-focused coaching', '대회 중심 코칭'),
      l('Mental performance routines', '멘탈 루틴'),
      l('Match planning and analysis', '경기 계획과 분석'),
      l('Individual development plan', '개인별 성장 계획'),
    ],
    ranks: [
      { name: l('Sharpshooter', 'Sharpshooter'), range: l('250–275', '250–275'), track: l('Sporter', 'Sporter') },
      { name: l('Expert', 'Expert'), range: l('275+', '275+'), track: l('Sporter', 'Sporter') },
      { name: l('NCAA Precision', 'NCAA Precision'), range: l('Separate discipline', '별도 종목'), track: l('Precision', 'Precision') },
    ],
  },
]

export const PROGRAMS = {
  eyebrow: l('The Sky Arc growth path', 'Sky Arc 성장 경로'),
  title: l('Train with purpose.', '목적 있게 훈련해요'),
  text: l(
    'Four program levels guide athletes from their first safe shot to advanced Sporter or NCAA Precision competition.',
    '네 단계의 프로그램이 안전한 첫 발부터 상위 Sporter나 NCAA Precision 대회까지 선수를 이끌어요.',
  ),
  overview: {
    title: l('One path. Personal progress.', '같은 길, 각자의 속도'),
    text: l(
      'Every athlete is treated as an individual—not a number. Coaches use live electronic scoring, performance history, and direct observation to focus training where it matters most.',
      '선수는 숫자가 아니라 한 사람이에요. 코치는 실시간 전자 채점과 지난 기록, 직접 관찰한 내용을 보고 가장 필요한 곳에 훈련을 집중해요.',
    ),
    note: l(
      'Rank scores reflect the academy’s 3×10 in-facility format. At advanced levels, score is only part of the picture: consistency, attitude, and coach evaluation matter too.',
      '등급 점수는 아카데미 실내에서 쏘는 3×10 방식 기준이에요. 상위 단계에서는 점수가 전부가 아니라 꾸준함과 태도, 코치 평가도 함께 봐요.',
    ),
  },
  labels: {
    focus: l('Training focus', '훈련 중점'),
    experience: l('Program experience', '프로그램 구성'),
    ranks: l('Ranks', '등급'),
    includes: l('Included', '포함 내용'),
    level: l('Level', '단계'),
    score: l('Score (3×10)', '점수 (3×10)'),
  },
  placement: {
    eyebrow: l('How placement works', '반 배정 방식'),
    title: l('Progress is more than a score.', '성장은 점수만으로 정하지 않아요'),
    steps: [
      {
        title: l('Train', '훈련'),
        text: l('Build safe, repeatable fundamentals in the athlete’s current program.', '지금 프로그램에서 안전하고 반복할 수 있는 기본기를 다져요.'),
        /** The step's parts, in a word each (from its sentence). */
        marks: [l('Safety', '안전'), l('Fundamentals', '기본기'), l('Repetition', '반복')],
      },
      {
        title: l('Demonstrate', '보여 주기'),
        text: l('Show technical consistency, responsible conduct, effort, and coachability.', '꾸준한 기술과 책임감 있는 태도, 노력, 배우려는 자세를 보여 줘요.'),
        marks: [l('Consistency', '꾸준함'), l('Conduct', '태도'), l('Effort', '노력'), l('Coachability', '배우는 자세')],
      },
      {
        title: l('Advance', '진급'),
        text: l('Move forward when score, readiness, and coach evaluation align.', '점수와 준비 정도, 코치 평가가 모두 맞으면 다음 단계로 가요.'),
        marks: [l('Score', '점수'), l('Readiness', '준비도'), l('Coach evaluation', '코치 평가')],
      },
    ],
  },
  pathways: {
    eyebrow: l('Advanced pathways', '상위 트랙'),
    title: l('Choose the right competitive track.', '나에게 맞는 대회 트랙 고르기'),
    text: l(
      'Both pathways demand discipline and strong fundamentals. Their equipment, uniform standards, and long-term competition goals are different.',
      '두 트랙 모두 절제와 탄탄한 기본기가 필요해요. 다만 장비와 복장 기준, 장기적인 대회 목표가 달라요.',
    ),
    items: [
      { tag: l('Sporter', 'Sporter'), title: l('Sharpshooter & Expert', 'Sharpshooter & Expert'), text: l('Continue developing advanced match performance within the regulated Sporter equipment class.', '규정된 Sporter 장비 등급 안에서 상위 경기력을 계속 키워요.') },
      { tag: l('Precision', 'Precision'), title: l('NCAA Precision', 'NCAA Precision'), text: l('Explore the specialized equipment and technical pathway used in collegiate and international-style competition.', '대학 대회와 국제 대회 방식에서 쓰는 전문 장비와 기술을 배워요.') },
    ],
    /** Where the Precision pathway leads (from its sentence). */
    leadsTo: [l('Collegiate competition', '대학 대회'), l('International-style competition', '국제 대회 방식')],
  },
  rankMap: {
    eyebrow: l('Rank & program map', '등급과 프로그램'),
    title: l('See where every rank belongs.', '등급이 어느 단계에 속하는지 한눈에'),
    text: l('The program level is the training foundation. The rank shows an athlete’s progress within that foundation.', '프로그램 단계는 훈련의 바탕이고, 등급은 그 안에서 선수가 얼마나 성장했는지 보여 줘요.'),
  },
  tuition: {
    eyebrow: l('Tuition', '수강료'),
    title: l('Training & tuition.', '훈련과 수강료'),
    text: l(
      'Programs are organized by demonstrated skill and readiness rather than school grade. Placement begins with a trial session and coach evaluation.',
      '프로그램은 학년이 아니라 실력과 준비 정도로 나눠요. 반 배정은 체험 수업과 코치 평가로 시작해요.',
    ),
    rate: l('Current rates available by inquiry', '수강료는 문의해 주세요'),
    cta: l('Request the tuition guide', '수강료 안내 받기'),
    note: l('We’re more than happy to discuss tuition. Send us an inquiry, and we’ll get back to you as soon as possible.', '수강료는 언제든 편하게 물어보세요. 문의를 남겨 주시면 최대한 빨리 답해 드릴게요.'),
    age: {
      title: l('Age informs placement. Skill drives progress.', '나이는 참고, 성장은 실력으로'),
      text: l(
        'Age does not automatically determine an athlete’s level, but it can affect physical readiness. Coaches consider safety habits, maturity, size, strength, coordination, and whether the athlete can comfortably support the rifle in each position.',
        '나이로 단계가 정해지지는 않지만, 나이는 신체 준비에 영향을 줄 수 있어요. 코치는 안전 습관과 성숙도, 체격, 근력, 협응력, 그리고 자세마다 총을 편하게 받칠 수 있는지를 함께 봐요.',
      ),
    },
  },
}

export const ABOUT = {
  eyebrow: l('Who we are', '저희를 소개해요'),
  title: l('Built with purpose.', '분명한 목적으로 세웠어요'),
  text: l(
    'Sky Arc is a youth development academy where technical excellence, personal growth, and a genuine sense of belonging share the same target.',
    'Sky Arc는 뛰어난 기술과 인격적 성장, 진정한 소속감을 같은 과녁에 두는 청소년 육성 아카데미예요.',
  ),
  mission: {
    eyebrow: l('Our mission', '미션'),
    title: l('Develop the athlete. Respect the process.', '선수를 키우고, 과정을 존중해요'),
    paragraphs: [
      l(
        'We believe young athletes do their best work when they feel safe, understood, appropriately challenged, and proud of the process behind their progress.',
        '어린 선수들은 안전하다고 느끼고, 이해받고, 알맞은 도전을 하며, 자기가 걸어온 과정을 자랑스러워할 때 가장 잘해요. 저희는 그렇게 믿어요.',
      ),
      l(
        'Sky Arc creates a structured environment where athletes learn to focus under pressure, take ownership of their decisions, and improve with intention. Our coaches begin with fundamentals, observe the individual, and shape training around what that athlete needs next.',
        'Sky Arc는 선수들이 긴장되는 순간에도 집중하고, 자기 결정에 책임지고, 뚜렷한 목표를 두고 나아지는 체계적인 환경을 만들어요. 코치는 기본기부터 시작해 선수 한 사람을 지켜보고, 그 선수에게 다음에 필요한 것에 맞춰 훈련을 짜요.',
      ),
      l(
        'Scores help measure progress, but they never tell the whole story. Confidence, discipline, resilience, judgment, and character are the qualities that make growth last—on the range and beyond it.',
        '점수는 성장을 재는 데 도움이 되지만, 모든 걸 말해 주지는 않아요. 자신감과 절제, 회복탄력성, 판단력, 인성이야말로 사대 안팎에서 오래 가는 성장을 만들어요.',
      ),
    ],
  },
  quote: l('We coach the athlete behind the rifle—not only the score on the target.', '표적 위의 점수만이 아니라, 총을 든 선수 그 사람을 가르쳐요.'),
  promiseLine: {
    title: l('Teach the process. Build the person.', '과정을 가르치고, 사람을 키워요'),
    text: l(
      'Sky Arc develops disciplined, confident athletes through safe instruction, purposeful practice, and individual accountability. We teach young people to remain composed, make thoughtful decisions, respect those around them, and carry those habits far beyond the range.',
      'Sky Arc는 안전한 지도와 목적 있는 연습, 스스로 책임지는 습관으로 절제력 있고 자신감 넘치는 선수를 키워요. 침착함을 잃지 않고, 신중하게 결정하고, 주변 사람을 존중하며, 그 습관을 사대 밖까지 가져가도록 가르쳐요.',
    ),
  },
  valuesTitle: l('What guides every session.', '모든 수업의 기준'),
  valuesText: l('Our values are visible in how we teach, how athletes train, and how families experience the academy.', '저희가 가르치는 방식, 선수들이 훈련하는 모습, 가족들이 아카데미에서 겪는 모든 순간에 이 가치가 담겨 있어요.'),
  values: [
    { title: l('Safety', '안전'), text: l('Every command, movement, and equipment habit begins with respect for the range and the people on it.', '구령 하나, 동작 하나, 장비 습관까지 모두 사대와 그곳의 사람들을 존중하는 데서 시작해요.') },
    { title: l('Discipline', '절제'), text: l('Athletes learn that dependable results come from a calm, repeatable process—not rushed outcomes.', '믿을 만한 결과는 서두른 결과가 아니라 차분하고 반복할 수 있는 과정에서 나온다는 걸 배워요.') },
    { title: l('Growth', '성장'), text: l('Coaching meets each athlete where they are and builds the next skill with purpose and patience.', '코칭은 선수가 지금 있는 자리에서 시작해, 목적과 인내로 다음 기술을 쌓아 가요.') },
    { title: l('Community', '공동체'), text: l('Coaches, athletes, and families work together to create a positive place to train and belong.', '코치와 선수, 가족이 함께 즐겁게 훈련하고 소속감을 느끼는 곳을 만들어 가요.') },
  ],
  principles: [
    { title: l('Safety first', '무엇보다 안전'), text: l('Respect every command, person, and piece of equipment.', '모든 구령과 사람, 장비를 존중해요.') },
    { title: l('Process over pressure', '압박보다 과정'), text: l('Build calm, repeatable habits before chasing outcomes.', '결과를 좇기 전에 차분하고 반복할 수 있는 습관부터 만들어요.') },
    { title: l('Ownership always', '언제나 스스로 책임지기'), text: l('Understand each result and choose the next adjustment.', '결과를 이해하고 다음 조정을 스스로 정해요.') },
    { title: l('Character beyond sport', '스포츠를 넘어선 인성'), text: l('Carry discipline, resilience, and confidence into daily life.', '절제와 회복탄력성, 자신감을 일상에서도 이어 가요.') },
  ],
  approach: {
    eyebrow: l('How we coach', '코칭 방식'),
    title: l('Individual by design.', '처음부터 한 사람에게 맞춰요'),
    text: l(
      'Athletes may share a range, but they do not all learn the same way or advance on the same timeline. Our coaching keeps the standards consistent while making the path personal.',
      '같은 사대에서 훈련해도 배우는 방식과 성장 속도는 모두 달라요. 그래서 기준은 똑같이 지키고, 가는 길은 선수마다 맞춰서 코칭해요.',
    ),
    items: [
      { title: l('See the athlete', '선수를 먼저 봐요'), text: l('We observe readiness, confidence, physical development, and learning style before deciding what comes next.', '다음 단계를 정하기 전에 준비 정도와 자신감, 신체 발달, 배우는 방식을 살펴요.') },
      { title: l('Build the process', '과정을 만들어요'), text: l('Safety, position, breathing, sight alignment, trigger control, follow-through, and shot calling become connected habits.', '안전, 자세, 호흡, 조준선 정렬, 격발 조절, 팔로스루, 탄착 예측이 하나로 이어진 습관이 돼요.') },
      { title: l('Create ownership', '스스로 책임지게 해요'), text: l('Athletes learn to understand results, make thoughtful adjustments, and take responsibility for their progress.', '결과를 이해하고, 신중하게 고쳐 나가고, 자기 성장에 책임지는 법을 배워요.') },
    ],
  },
  promise: {
    eyebrow: l('Our promise to families', '학부모님께 드리는 약속'),
    title: l('A place to grow with confidence.', '자신감 있게 성장하는 곳'),
    items: [
      { title: l('Clear pathways', '분명한 경로'), text: l('Families understand what athletes are learning, what progress looks like, and how readiness shapes the next step.', '아이가 무엇을 배우는지, 성장이 어떤 모습인지, 준비 정도에 따라 다음 단계가 어떻게 정해지는지 알 수 있어요.') },
      { title: l('Thoughtful coaching', '세심한 코칭'), text: l('Feedback is specific, constructive, age-appropriate, and focused on what the athlete can act on.', '피드백은 구체적이고 건설적이며, 나이에 맞게, 선수가 바로 실천할 수 있는 것에 집중해요.') },
      { title: l('Lasting development', '오래 가는 성장'), text: l('We build habits and character that support competition goals without losing sight of the young person developing them.', '대회 목표에 도움이 되는 습관과 인성을 기르면서도, 그 안에서 자라는 아이를 놓치지 않아요.') },
    ],
  },
  team: {
    eyebrow: l('Meet the team', '코치진 소개'),
    title: l('Experience that shapes every athlete.', '선수를 키우는 경험'),
    text: l(
      'Sky Arc brings together competition experience, certified instruction, military leadership, athlete development, and disciplined facility operations. Each team member contributes a distinct area of expertise to one shared standard.',
      'Sky Arc에는 대회 경험과 공인 지도 자격, 군에서 쌓은 리더십, 선수 육성 경험, 체계적인 시설 운영 노하우가 모여 있어요. 코치진 한 사람 한 사람이 자기 전문 분야로 같은 기준을 함께 지켜요.',
    ),
  },
}

export const TEAM_PHOTO_TODO = l('Photo needed: coach portrait', '사진 준비 중: 코치 사진')

export type GalleryCategory = 'training' | 'coaching' | 'competition' | 'community'

export const GALLERY = {
  eyebrow: l('The Sky Arc experience', 'Sky Arc의 순간들'),
  title: l('In the moment.', '그 순간 속으로'),
  text: l('A clear look at athlete growth, focused practice, competition, and the community behind every shot.', '선수의 성장과 집중하는 연습, 대회, 그리고 한 발 한 발을 함께하는 사람들을 담았어요.'),
  categories: [
    { id: 'all', label: l('All', '전체') },
    { id: 'training', label: l('Training', '훈련') },
    { id: 'coaching', label: l('Coaching', '코칭') },
    { id: 'competition', label: l('Competition', '대회') },
    { id: 'community', label: l('Community', '커뮤니티') },
  ] as { id: 'all' | GalleryCategory; label: L }[],
  /** Spots for photos the academy still has to send, while the gallery is short. */
  todo: [
    l('The range and its lanes', '사대와 사로'),
    l('Equipment up close', '가까이서 본 장비'),
    l('A first trial class', '첫 체험 수업'),
    l('The team photo', '단체 사진'),
    l('Results day', '결과 발표 날'),
  ],
  empty: l('Photos are on their way.', '사진을 준비하고 있어요.'),
}

export type NewsCategory = 'results' | 'competitions' | 'announcements' | 'training'
export const NEWS = {
  eyebrow: l('News & updates', '소식'),
  title: l('News from the range.', '사대에서 전하는 소식'),
  text: l('Tournament results, competition updates and announcements from Sky Arc.', 'Sky Arc의 대회 결과와 경기 소식, 공지를 전해요.'),
  categories: {
    results: l('Results', '결과'),
    competitions: l('Competitions', '대회'),
    announcements: l('Announcements', '공지'),
    training: l('Training', '훈련'),
  } as Record<NewsCategory, L>,
  all: l('All', '전체'),
  writtenNote: l('Posts appear in the language they were written in.', '글은 쓴 언어 그대로 보여요.'),
  share: l('Share', '공유'),
  copied: l('Link copied', '링크를 복사했어요'),
  more: l('More news', '다른 소식'),
  empty: l('News is on its way. Check back soon for results and updates from the range.', '곧 소식을 전해 드릴게요. 대회 결과와 사대 소식을 기다려 주세요.'),
  notFound: l('This post isn’t available.', '이 글을 찾을 수 없어요.'),
}

/** A question and its answer; `hours` answers with the hours the Website page sets. */
export interface FaqItem {
  q: L
  a: L
  hours?: boolean
}

export const FAQ: FaqItem[] = [
  {
    q: l('What age can my child start?', '몇 살부터 시작할 수 있나요?'),
    a: l('Placement is led by skill, safety and readiness, not school grade. Younger athletes start with bench support at Launchpad.', '반 배정은 학년이 아니라 실력과 안전 습관, 준비 정도로 정해요. 어린 선수는 Launchpad에서 벤치 지지대를 쓰며 시작해요.'),
  },
  {
    q: l('Does my child need any experience?', '경험이 없어도 되나요?'),
    a: l('No. New athletes start with Trial One, which covers safety, range procedures and the rifle before any shooting. Launchpad then builds the shot process from the bench.', '네, 없어도 돼요. 처음 오는 선수는 사격 전에 안전과 사대 절차, 총을 배우는 1차 체험부터 시작하고, 그다음 Launchpad에서 벤치 지지대로 사격 과정을 익혀요.'),
  },
  {
    q: l('What should we bring?', '무엇을 챙겨 가야 하나요?'),
    a: l('Comfortable clothing and closed-toe shoes. Please arrive ten minutes early. Equipment guidance is provided.', '편한 옷과 앞이 막힌 신발이면 돼요. 10분 일찍 와 주세요. 장비는 아카데미에서 안내해 드려요.'),
  },
  {
    q: l('How does the trial work?', '체험 수업은 어떻게 진행되나요?'),
    a: l(
      'Trial One introduces safety, range commands and the rifle, with no shooting. Trial Two is a longer, hands-on session with coached shots from a supported position. You request Trial One online and we confirm a time by email; afterwards we help you book Trial Two.',
      '1차 체험에서는 사격 없이 안전과 사대 구령, 총을 배워요. 2차 체험은 더 긴 실습 수업으로, 지지대 자세에서 코치와 함께 사격해요. 1차 체험을 온라인으로 신청하시면 이메일로 시간을 정해 드리고, 끝난 뒤에는 2차 체험 예약을 도와 드려요.',
    ),
  },
  {
    q: l('How much is tuition?', '수강료는 얼마인가요?'),
    a: l('Current rates are available by inquiry. Ask us for the tuition guide and we’ll get back to you as soon as possible.', '수강료는 문의해 주시면 안내해 드려요. 수강료 안내를 요청하시면 최대한 빨리 답해 드릴게요.'),
  },
  {
    q: l('When are classes?', '수업은 언제 있나요?'),
    a: l('Ask us for the current class times, or see the hours on our Contact page.', '지금 수업 시간은 문의해 주시거나, 문의 페이지의 운영 시간을 확인해 주세요.'),
    hours: true,
  },
  {
    q: l('How do athletes move up?', '다음 단계로는 어떻게 올라가나요?'),
    a: l('Formal evaluations happen each quarter. Coaches may recommend an earlier evaluation when skill, safety and physical readiness support the next position.', '정식 평가는 분기마다 있어요. 실력과 안전, 신체 준비가 다음 자세에 맞을 만큼 갖춰지면 코치가 평가를 앞당기자고 권할 수 있어요.'),
  },
  {
    q: l('Can my child compete?', '대회에도 나갈 수 있나요?'),
    a: l('Yes. Development athletes prepare for postal, CMP and school competition, and Performance athletes follow the Sporter or NCAA Precision pathway.', '네. Development 단계에서는 우편 대회와 CMP, 학교 대회를 준비하고, Performance 단계에서는 Sporter나 NCAA Precision 트랙을 따라가요.'),
  },
  {
    q: l('How will I know how my child is doing?', '아이가 잘하고 있는지 어떻게 알 수 있나요?'),
    a: l('Parents log in to the Sky Arc portal to see class schedules, scores and progress reports, with notes from the coaches.', 'Sky Arc 포털에 로그인하면 수업 일정과 점수, 코치 코멘트가 담긴 성장 리포트를 볼 수 있어요.'),
  },
]

export const TRIAL = {
  eyebrow: l('Book a trial', '체험 수업 신청'),
  title: l('Start with Trial One.', '1차 체험부터 시작해요'),
  text: l(
    'Trial One introduces the safety culture and essential knowledge needed before the hands-on Trial Two. Tell us the days that suit you, and we’ll confirm a time.',
    '1차 체험에서는 직접 쏴 보는 2차 체험 전에 꼭 알아야 할 안전 문화와 기본 지식을 배워요. 편한 요일을 알려 주시면 시간을 정해 드릴게요.',
  ),
  kinds: {
    // How long each trial runs is still to confirm with the academy: no length is shown until then.
    one: { name: l('Trial One', '1차 체험'), summary: l('Safety, commands and rifle orientation', '안전 수칙, 구령, 총 다루는 법 안내'), minutes: null as number | null },
    two: { name: l('Trial Two', '2차 체험'), summary: l('Longer setup and hands-on coached shooting', '더 긴 준비 시간과 코치와 함께하는 실습 사격'), minutes: null as number | null },
  },
  covers: {
    title: l('What Trial One covers', '1차 체험에서 배우는 것'),
    items: [
      { title: l('Safety', '안전'), text: l('Core safety rules and the behavior expected whenever athletes enter the range.', '사대에 들어설 때마다 지켜야 할 기본 안전 수칙과 행동.') },
      { title: l('Range procedures', '사대 절차'), text: l('Commands, preparation, movement, and how a safe training session flows.', '구령과 준비, 이동, 안전한 훈련이 흘러가는 순서.') },
      { title: l('Rifle information', '총 알아보기'), text: l('Bare-bones equipment knowledge, responsible handling, and the purpose of key components.', '꼭 필요한 장비 지식과 책임 있게 다루는 법, 주요 부품의 역할.') },
    ],
  },
  two: {
    title: l('Now it gets hands-on.', '이제 직접 해 봐요'),
    text: l(
      'Trial Two is a longer follow-up session because safe setup and coached shooting take time. Coaches review the safety rules and confirm every athlete is ready before anyone shoots.',
      '안전하게 준비하고 코치와 함께 쏘려면 시간이 걸려서, 2차 체험은 더 길게 진행해요. 사격하기 전에 코치가 안전 수칙을 다시 짚고, 모두 준비됐는지 확인해요.',
    ),
    items: [
      { title: l('Review and set up', '복습하고 준비하기'), text: l('Revisit commands, safe handling, and the lessons from Trial One before getting properly set up.', '장비를 제대로 갖추기 전에 구령과 안전한 취급, 1차 체험에서 배운 내용을 다시 짚어요.') },
      { title: l('Get behind the rifle', '총 잡아 보기'), text: l('Learn how to settle the rifle safely from a supported position, then experience sight alignment and trigger control.', '지지대 자세에서 총을 안전하게 자리 잡는 법을 배우고, 조준선 정렬과 격발 조절을 직접 해 봐요.') },
      { title: l('Take coached shots', '코치와 함께 쏴 보기'), text: l('Take guided shots through age-appropriate target activities and simple challenges that make learning rewarding.', '나이에 맞는 표적 활동과 간단한 도전 과제로, 코치의 안내를 받으며 재미있게 쏴 봐요.') },
    ],
  },
  steps: {
    athlete: l('The athlete', '자녀 정보'),
    time: l('Pick a time', '시간 선택'),
    family: l('Your details', '보호자 정보'),
    confirm: l('Confirm', '확인'),
  },
  fields: {
    firstName: l('Athlete’s first name', '자녀 이름'),
    lastName: l('Athlete’s last name', '자녀 성'),
    grade: l('Grade', '학년'),
    experience: l('Experience', '사격 경험'),
    parentName: l('Parent or guardian name', '보호자 이름'),
    email: l('Email', '이메일'),
    phone: l('Phone', '전화번호'),
    language: l('Language for our reply', '답변받을 언어'),
    notes: l('Anything we should know? (optional)', '미리 알려 주실 내용 (선택)'),
    consent: l('I agree to the privacy policy.', '개인정보 처리방침에 동의합니다.'),
    privacy: l('Privacy policy', '개인정보 처리방침'),
  },
  grades: [
    ...Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), label: l(`Grade ${i + 1}`, `${i + 1}학년`) })),
    { id: 'other', label: l('Other', '기타') },
  ],
  experience: [
    { id: 'none', label: l('New to shooting', '처음이에요') },
    { id: 'some', label: l('Some experience', '조금 해 봤어요') },
    { id: 'competed', label: l('Has competed', '대회에 나간 적 있어요') },
  ],
  buttons: {
    continue: l('Continue', '다음'),
    back: l('Back', '이전'),
    book: l('Book Trial One', '1차 체험 예약하기'),
    bookTwo: l('Book Trial Two', '2차 체험 예약하기'),
    booking: l('Booking…', '예약하는 중…'),
    change: l('Change', '변경'),
  },
  slots: {
    title: l('Open times', '예약할 수 있는 시간'),
    none: l('No open times this day.', '이날은 예약할 수 있는 시간이 없어요.'),
    noneWeek: l('No open times this week.', '이번 주에는 예약할 수 있는 시간이 없어요.'),
    full: l('Full', '마감'),
    closed: l('Closed', '휴무'),
    byArrangement: l('By arrangement', '예약제'),
    next: l('Next open', '가장 빠른 시간'),
    note: l('Times shown are open now, from the coaches’ availability and class sizes.', '코치 일정과 수업 정원을 반영해 지금 예약할 수 있는 시간만 보여요.'),
    demo: l('Demo: these times are made up.', '데모: 가상의 시간이에요.'),
    week: l('Week of', '주간'),
  },
  done: {
    title: l('You’re booked.', '예약이 완료됐어요.'),
    emailed: l('We’ve emailed the details to', '예약 내용을 이메일로 보냈어요:'),
    reference: l('Reference', '예약 번호'),
    calendar: l('Add to calendar', '캘린더에 추가'),
    nextTitle: l('What happens next', '다음 단계'),
    next: l('After Trial One, we’ll email you a link to book Trial Two.', '1차 체험이 끝나면 2차 체험 예약 링크를 이메일로 보내 드릴게요.'),
    change: l('Need to change it? Use the link in the email, or contact us.', '바꾸고 싶다면 이메일의 링크를 이용하거나 문의해 주세요.'),
    another: l('Book for another athlete', '다른 자녀도 예약하기'),
  },
  trialTwo: {
    title: l('Done Trial One?', '1차 체험을 마치셨나요?'),
    text: l('Book Trial Two with the link we emailed you, or enter your Trial One reference here.', '이메일로 보내 드린 링크로 2차 체험을 예약하거나, 여기에 1차 체험 예약 번호를 입력하세요.'),
    reference: l('Trial One reference', '1차 체험 예약 번호'),
    find: l('Find my booking', '예약 찾기'),
    found: l('Found it. Pick a time for Trial Two.', '찾았어요. 2차 체험 시간을 골라 주세요.'),
  },
  errors: {
    required: l('Required', '꼭 입력해 주세요'),
    email: l('Enter a valid email', '이메일 주소를 정확히 입력해 주세요'),
    consent: l('Please agree to continue', '계속하려면 동의해 주세요'),
    slot: l('Pick a time', '시간 선택'),
    reference: l('Enter the reference from your email (SA-…)', '이메일에 있는 예약 번호를 입력해 주세요 (SA-…)'),
  },
}

export const CONTACT = {
  eyebrow: l('Start a conversation', '문의하기'),
  title: l('Let’s connect.', '편하게 물어보세요'),
  text: l(
    'Questions about programs, tuition, equipment, or placement? Send a message and it goes straight to the academy.',
    '프로그램, 수강료, 장비, 반 배정이 궁금하신가요? 메시지를 보내시면 아카데미로 바로 전달돼요.',
  ),
  fields: {
    name: l('Parent or guardian name', '보호자 이름'),
    email: l('Email', '이메일'),
    phone: l('Phone (optional)', '전화번호 (선택)'),
    student: l('Student age or grade', '자녀 나이 또는 학년'),
    topic: l('What can we help with?', '무엇이 궁금하세요?'),
    message: l('Message', '내용'),
    language: l('Language for our reply', '답변받을 언어'),
  },
  topics: [
    { id: 'program', label: l('Program information', '프로그램 안내') },
    { id: 'tuition', label: l('Tuition', '수강료') },
    { id: 'trial', label: l('Trial session', '체험 수업') },
    { id: 'competition', label: l('Competition pathway', '대회 경로') },
    { id: 'range', label: l('Open range or private coaching', '자유 사격·개인 레슨') },
    { id: 'general', label: l('General inquiry', '기타 문의') },
  ],
  send: l('Send message', '보내기'),
  sending: l('Sending…', '보내는 중…'),
  sent: { title: l('Message sent.', '메시지를 보냈어요.'), text: l('Thanks. We’ll reply to', '감사합니다. 이 주소로 답해 드릴게요:'), again: l('Send another message', '다른 메시지 보내기') },
  response: l('We’ll reply as soon as possible.', '최대한 빨리 답해 드릴게요.'),
  delivered: l('Your message goes straight to the academy.', '메시지는 아카데미로 바로 전달돼요.'),
}

export const PORTAL = {
  eyebrow: l('For Sky Arc families', 'Sky Arc 학부모님을 위해'),
  title: l('Your parent portal.', '학부모 포털'),
  text: l('One login for schedules, scores, progress reports and academy news, on any device.', '한 번 로그인으로 일정, 점수, 성장 리포트, 아카데미 소식을 어느 기기에서든 확인해요.'),
  features: [
    { title: l('Classes', '수업'), text: l('See upcoming classes and any changes.', '다가오는 수업과 바뀐 일정을 확인해요.') },
    { title: l('Scores', '점수'), text: l('Every result, with where the shots went.', '모든 기록과 탄착 위치.') },
    { title: l('Progress reports', '성장 리포트'), text: l('Shared by the coaches after evaluations.', '평가가 끝나면 코치가 공유해요.') },
    { title: l('News', '소식'), text: l('Announcements and results from the academy.', '아카데미 공지와 대회 결과.') },
  ],
  cta: l('Log in to the portal', '포털 로그인'),
  invite: l('Families get their login from the academy. Coaches and staff sign in here too.', '로그인 정보는 아카데미에서 안내해 드려요. 코치와 스태프도 여기서 로그인해요.'),
}

/**
 * The phone app (`/get-app`, the band on the homepage, the footer): what it does for families, in the stores' own words for
 * the stores. The credit line is the stores' required wording, in English on both pages.
 */
export const APP = {
  kicker: l('The Sky Arc app', 'Sky Arc 앱'),
  title: l('Sky Arc on your phone.', '휴대폰으로 보는 Sky Arc'),
  text: l(
    'Classes, scores, progress reports and academy news on your iPhone or Android phone, with a notification when something changes.',
    '수업, 점수, 성장 리포트, 아카데미 소식을 iPhone과 Android 휴대폰에서 확인해요. 바뀐 일정은 알림으로 바로 알려 드려요.',
  ),
  free: l(
    'Free for Sky Arc families, students and coaches. Sign in with the email you gave the academy.',
    'Sky Arc 학부모님과 학생, 코치는 무료로 쓸 수 있어요. 아카데미에 알려 주신 이메일로 로그인해요.',
  ),
  scan: l('Scan with your phone’s camera', '휴대폰 카메라로 스캔해 보세요'),
  features: [
    { title: l('Classes', '수업'), text: l('Today’s class and the week ahead. Cancel one, or ask for a makeup.', '오늘 수업과 이번 주 일정을 보고, 취소하거나 보강을 신청해요.') },
    { title: l('Scores', '점수'), text: l('Every result and where the shots went, with the trend over time.', '모든 기록과 탄착 위치, 점수 흐름을 한눈에 봐요.') },
    { title: l('Progress reports', '성장 리포트'), text: l('The coaches’ reports, shared after evaluations.', '평가가 끝나면 코치가 리포트를 공유해요.') },
    { title: l('Notifications', '알림'), text: l('Class changes, makeups and academy news as they happen.', '수업 변경, 보강, 아카데미 소식을 바로 받아요.') },
  ],
  band: {
    title: l('Get the Sky Arc app.', 'Sky Arc 앱을 받아 보세요'),
    text: l('Classes, scores and progress reports on your phone, with a notification when something changes.', '수업과 점수, 성장 리포트를 휴대폰에서 보고, 바뀐 일정은 알림으로 받아요.'),
    more: l('About the app', '앱 소개'),
  },
  footer: l('Get the app', '앱 다운로드'),
  appStore: l('Download on the App Store', 'App Store에서 다운로드하기'),
  googlePlay: l('Get it on Google Play', 'Google Play에서 다운로드하기'),
  shots: [l('Home: the next class', '홈: 다음 수업'), l('Scores', '점수'), l('A progress report', '성장 리포트')],
  credit: l(
    'Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc. Google Play and the Google Play logo are trademarks of Google LLC.',
    'Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc. Google Play and the Google Play logo are trademarks of Google LLC.',
  ),
}

export const FOOTER = {
  tagline: l('Focused athletes. Confident people.', '집중하는 선수, 자신감 있는 사람'),
  text: l(
    'Safe, disciplined training that builds strong fundamentals, resilience, and respect for the sport—from the first shot forward.',
    '첫 발부터 탄탄한 기본기와 회복탄력성, 스포츠를 존중하는 마음을 기르는 안전하고 규율 있는 훈련.',
  ),
  languageNote: l(
    'Translations support reading access. Coaching, safety commands, and academy communication are conducted in English.',
    '한국어 페이지는 읽기 편하시도록 준비했어요. 코칭과 안전 구령, 아카데미 안내는 영어로 진행해요.',
  ),
  copyright: l(`© ${new Date().getFullYear()} Sky Arc Sports Academy. All rights reserved.`, `© ${new Date().getFullYear()} Sky Arc Sports Academy. All rights reserved.`),
  privacy: l('Privacy policy', '개인정보 처리방침'),
  terms: l('Terms of service', '이용약관'),
  help: l('Help', '도움말'),
  sections: { explore: l('Explore', '둘러보기'), visit: l('Visit', '오시는 길'), families: l('Families', '학부모') },
}

export const NOT_FOUND = {
  title: l('Page not found.', '페이지를 찾을 수 없어요'),
  text: l('The page you’re looking for has moved or doesn’t exist.', '찾으시는 페이지가 옮겨졌거나 없는 페이지예요.'),
}

/** Page titles, for the browser tab. */
export const TITLES: Record<string, L> = {
  '': l('Youth air rifle in Suwanee, GA', '조지아주 스와니 청소년 공기소총'),
  programs: l('Programs & tuition', '프로그램과 수강료'),
  about: l('About & coaches', '소개와 코치진'),
  gallery: l('Gallery', '갤러리'),
  news: l('News', '소식'),
  trial: l('Book a trial', '체험 수업 신청'),
  contact: l('Contact', '문의'),
  portal: l('Parent portal', '학부모 포털'),
  '404': l('Page not found', '페이지를 찾을 수 없음'),
}
