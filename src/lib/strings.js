// ──────────────────────────────────────────────
// 뇌내강호 문구 팩 — 화면에 보이는 모든 텍스트는 여기서.
// muhyeop(무협 톤, 기본)과 plain(일반 톤) 두 벌을 같은 키로 유지한다.
// 선택은 ui.tone, 전환은 상단 바 '무공봉인' 토글(store.toggleTone).
// 새 문구를 들일 때는 반드시 두 팩 모두에 같은 키로 추가할 것.
// 팩은 순수 데이터(JSON 직렬화 가능) 유지 — 함수 금지. 매개변수가 필요한
// 문구는 '{label}' 같은 플레이스홀더로 쓰고 fmt()로 치환한다.
// 정합성은 scripts/check-strings.mjs(npm run check)가 지킨다.
// ──────────────────────────────────────────────

export const TONES = ['muhyeop', 'plain'] // [0]이 기본값

// 플레이스홀더 치환: fmt('{label} 색으로', { label: '먹' }) → '먹 색으로'
// 빠진 매개변수는 {이름}을 그대로 남겨 화면에서 바로 눈에 띄게 한다.
export function fmt(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
}

export const STRINGS = {
  muhyeop: {
    docTitle: '뇌내강호 — 두서없는 아이디어 정리소',
    titleMain: '腦內江湖',
    titleSub: '뇌내강호 · 두서없는 아이디어 정리소',
    colophon: '腦內江湖 — 한 글자의 다름에서',

    colorLabel: { muk: '먹', cheong: '청', dan: '단', hwang: '황', nam: '남' },
    paletteAria: '오행 색',
    paletteSet: '선택한 쪽지를 {label} 색으로',

    newNode: '새 쪽지 — 지금 붓 색으로 핀다',
    mdButtonTitle: '비급.md — 강호를 트리 개요로 펴낸다',
    mdButtonAria: '비급.md 출력',
    exportButton: '내보내기',
    importButton: '불러오기',
    clearButton: '강호 비우기',
    clearConfirm: '진짜 비움?',
    toneButton: '封',
    toneButtonAria: '무공봉인',
    toneButtonTitle: '무공을 봉인하고 일반 말투로 전환',
    helpAria: '도움말',

    canvasAria: '강호 — 생각의 캔버스',
    emptyTitle: '허공이 비어 있다.',
    emptyHint: '빈 곳을 두 번 두드리면 念이 핀다 — 우상단 ? 참고',

    nodePlaceholder: '念…',
    handleTitle: '끌어서 다른 쪽지에 緣 잇기 (허공에 놓으면 새 쪽지)',
    handleAria: '緣 잇기',
    resizeHandleTitle: '좌·우 변을 끌어 너비 조절 (두 번 두드리면 자동 너비로)',
    resizeHandleAria: '너비 조절',
    foldBadgeTitle: '가지 봉문/개문 (단축키 C) — 접으면 후손 쪽지가 숨는다',
    foldBadgeAria: '가지 접기/펼치기',

    zoomOutAria: '축소',
    zoomInAria: '확대',
    resetViewTitle: '축경 100% — 보던 자리 그대로',
    fitButton: '全',
    fitButtonTitle: '강호 전경 — 모든 쪽지를 한눈에 (Shift+1)',
    fitAria: '전체 보기',

    searchPlaceholder: '念 수소문 — 글자 일부로 찾기',
    searchEmpty: '그런 念은 강호에 없다',
    minimapAria: '강호 전도',

    helpTitle: '강호 행보 요결',
    helpItems: [
      ['빈 곳 2번', '새 念(쪽지) 피우기'],
      ['쪽지 2번', '글 고치기'],
      ['쪽지 끌기', '자리 옮기기'],
      ['붉은 점 끌기', '緣 잇기 · 허공에 놓으면 새 쪽지'],
      ['좌·우 변 끌기', '쪽지 너비 조절 · 두 번 두드리면 자동'],
      ['오행 팔레트', '선택 시 물들이기 · 빈손 클릭=붓 색 · 호버=같은 색 비추기'],
      ['Tab', '가지 치기 · 선택 없으면 화면 중심 쪽지 선택'],
      ['Enter', '형제 가지치기 — 같은 부모 밑에 새 쪽지'],
      ['F2', '선택한 쪽지 글 고치기 (Ctrl+Enter도)'],
      ['Delete', '선택한 쪽지/緣 베기'],
      ['F', '가리키거나 선택한 緣 방향 뒤집기 (한 가닥씩)'],
      ['C·Space / 배지', '선택한 쪽지의 가지 봉문/개문'],
      ['R / Shift+R', '가지런히 — 강호 전체 / 선택한 가지만'],
      ['Z / Shift+Z', '선택 쪽지 기준 확대/축소 — 한 손 줌'],
      ['Alt+화살표', '緣 타고 이동 — ←부모 →자식 ↑↓형제'],
      ['Ctrl ± · 0', '축경(줌) · 0이면 100%로'],
      ['Ctrl+Z / Y', '시간 되돌리기 / 다시 감기'],
      ['Ctrl+F', '念 수소문 — Enter 순회 · Shift+Enter 역순'],
      ['Shift+1', '강호 전경 — 전체 보기'],
      ['Shift+2', '선택한 쪽지를 화면 가득히'],
      ['화살표 키', '유람 · 쪽지 선택 중엔 그 쪽지 옮기기 (Shift 성큼)'],
      ['PgUp/PgDn', '한 화면씩 오르내리기'],
      ['빈 곳 끌기', '강호 유람(이동)'],
      ['휠', '축경(줌)'],
      ['두 손가락', '꼬집어 축경 · 끌어 유람 (터치)'],
    ],
    closeButton: '닫기',

    exportTitle: '내공 내보내기 — JSON',
    importTitle: '내공 흡수 — JSON / 비급.md 붙여넣기',
    importHint: '내보낸 JSON이든 비급.md(들여쓰기 불릿 개요)든 그대로 붙여넣으시게 — 양식은 알아서 알아본다.',
    mdTitle: '비급으로 출력 — Markdown',
    cancelButton: '취소',
    applyImportButton: '흡수',
    copyButton: '복사',
    importBadShape: '형식이 비급답지 않습니다. JSON 또는 들여쓰기 불릿(비급.md)이어야 함.',
    importParseFail: 'JSON 해독 실패 — 주화입마 직전에 멈췄다 ㅋ 다시 확인을.',
    copyOk: '복사 완료. 단전에 잘 갈무리하시길.',
    copyFail: '자동 복사 실패 — 본문을 직접 긁어가시게.',

    mdHeading: '# 뇌내강호 — 念 모음',
    mdEmptyNode: '(빈 쪽지)',
  },

  plain: {
    docTitle: '아이디어 맵 — 생각을 잇는 캔버스',
    titleMain: '아이디어 맵',
    titleSub: '생각을 잇는 캔버스',
    colophon: '', // 빈 값이면 콜로폰을 그리지 않는다

    colorLabel: { muk: '흑', cheong: '녹', dan: '적', hwang: '황', nam: '남' },
    paletteAria: '노트 색',
    paletteSet: '선택한 노트를 {label} 색으로',

    newNode: '새 노트 — 현재 선택 색으로 추가',
    mdButtonTitle: 'Markdown 출력 — 트리 개요',
    mdButtonAria: 'Markdown 출력',
    exportButton: '내보내기',
    importButton: '가져오기',
    clearButton: '모두 지우기',
    clearConfirm: '정말 지울까요?',
    toneButton: '武',
    toneButtonAria: '무협모드',
    toneButtonTitle: '무협 말투로 전환',
    helpAria: '도움말',

    canvasAria: '아이디어 캔버스',
    emptyTitle: '캔버스가 비어 있습니다.',
    emptyHint: '빈 곳을 더블클릭하면 새 노트가 생깁니다 — 우상단 ? 참고',

    nodePlaceholder: '메모…',
    handleTitle: '끌어서 다른 노트에 연결 (빈 곳에 놓으면 새 노트)',
    handleAria: '연결하기',
    resizeHandleTitle: '좌/우 가장자리를 끌어 너비 조절 (더블클릭하면 자동 너비)',
    resizeHandleAria: '너비 조절',
    foldBadgeTitle: '하위 노트 접기/펼치기 (단축키 C)',
    foldBadgeAria: '접기/펼치기',

    zoomOutAria: '축소',
    zoomInAria: '확대',
    resetViewTitle: '배율 100% (보던 위치 유지)',
    fitButton: '전체',
    fitButtonTitle: '모든 노트가 보이도록 맞춤 (Shift+1)',
    fitAria: '전체 보기',

    searchPlaceholder: '노트 검색 — 글자 일부 입력',
    searchEmpty: '결과 없음',
    minimapAria: '미니맵',

    helpTitle: '사용법',
    helpItems: [
      ['빈 곳 더블클릭', '새 노트 만들기'],
      ['노트 더블클릭', '내용 편집'],
      ['노트 드래그', '이동'],
      ['빨간 점 드래그', '연결 · 빈 곳에 놓으면 새 노트'],
      ['좌/우 변 드래그', '노트 너비 조절 · 더블클릭이면 자동'],
      ['색 팔레트', '선택 시 색 지정 · 빈 클릭=기본색 선택 · 호버=같은 색 강조'],
      ['Tab', '하위 노트 추가 · 선택 없으면 중앙 노트 선택'],
      ['Enter', '형제 노트 만들기 (같은 부모)'],
      ['F2', '선택한 노트 편집 (Ctrl+Enter도 가능)'],
      ['Delete', '선택한 노트/연결 삭제'],
      ['F', '마우스로 가리키거나 선택한 연결 방향 뒤집기'],
      ['C·Space / 배지', '선택한 노트의 하위 접기/펼치기'],
      ['R / Shift+R', '자동 정렬 — 전체 / 선택한 가지만'],
      ['Z / Shift+Z', '선택 노트 기준 확대/축소'],
      ['Alt+화살표', '연결 따라 이동 — ←부모 →자식 ↑↓형제'],
      ['Ctrl ± · 0', '확대/축소 · 0이면 100%'],
      ['Ctrl+Z / Y', '실행 취소 / 다시 실행'],
      ['Ctrl+F', '노트 검색 — Enter 다음 · Shift+Enter 이전'],
      ['Shift+1', '전체 보기 (맞춤)'],
      ['Shift+2', '선택 노트 화면 맞춤'],
      ['화살표 키', '화면 이동 · 노트 선택 시 노트 이동 (Shift 크게)'],
      ['PgUp/PgDn', '한 화면씩 위/아래'],
      ['빈 곳 드래그', '화면 이동(팬)'],
      ['휠', '확대/축소'],
      ['두 손가락', '핀치 줌 · 화면 이동 (터치)'],
    ],
    closeButton: '닫기',

    exportTitle: '내보내기 — JSON',
    importTitle: '가져오기 — JSON / Markdown 붙여넣기',
    importHint: '내보내기한 JSON 또는 들여쓰기 목록(Markdown)을 붙여넣으면 형식을 자동으로 인식합니다.',
    mdTitle: 'Markdown 출력',
    cancelButton: '취소',
    applyImportButton: '가져오기',
    copyButton: '복사',
    importBadShape: '형식이 올바르지 않습니다. JSON 또는 들여쓰기 목록(Markdown)이어야 합니다.',
    importParseFail: 'JSON 파싱에 실패했습니다. 내용을 다시 확인해 주세요.',
    copyOk: '복사했습니다.',
    copyFail: '자동 복사에 실패했습니다. 본문을 직접 복사해 주세요.',

    mdHeading: '# 아이디어 맵 — 노트 모음',
    mdEmptyNode: '(빈 노트)',
  },
}
