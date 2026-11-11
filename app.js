/**
 * ========================================================
 * 🎓 디지털 롤링페이퍼 - 프론트엔드 & Supabase 연동 로직
 * ========================================================
 */
const SUPABASE_URL = 'https://qweexjjtkaxgmnyelqrt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_R3vbvXLOM3qIbJVYQDUd2w_8ENcdBW5';

// URL 정리 (혹시 /rest/v1 이 붙어있더라도 자동 제거)
const cleanSupabaseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

// Supabase 클라이언트 초기화 (CDN 변수명 충돌 방지를 위해 supabaseClient 사용)
let supabaseClient = null;
const isConfigured = cleanSupabaseUrl !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

if (isConfigured && window.supabase && typeof window.supabase.createClient === 'function') {
  supabaseClient = window.supabase.createClient(cleanSupabaseUrl, SUPABASE_ANON_KEY);
}

// 메모 데이터 캐시 (검색 기능용)
let allMemos = [];

// DOM 요소 참조
const memoGrid = document.getElementById('memoGrid');
const memoCountEl = document.getElementById('memoCount');
const loadingSpinner = document.getElementById('loadingSpinner');
const emptyState = document.getElementById('emptyState');
const setupNotice = document.getElementById('setupNotice');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');

// 모달 관련 요소
const modalBackdrop = document.getElementById('modalBackdrop');
const openModalBtn = document.getElementById('openModalBtn');
const fabBtn = document.getElementById('fabBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const memoForm = document.getElementById('memoForm');
const contentInput = document.getElementById('contentInput');
const charCount = document.getElementById('charCount');
const submitBtn = document.getElementById('submitBtn');

// ==========================================
// 1. 초기화 및 이벤트 리스너 등록
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 라이브러리가 늦게 로드될 경우 대비
  if (!supabaseClient && isConfigured && window.supabase?.createClient) {
    supabaseClient = window.supabase.createClient(cleanSupabaseUrl, SUPABASE_ANON_KEY);
  }

  // 설정 여부 확인
  if (!isConfigured || !supabaseClient) {
    if (!isConfigured) {
      setupNotice.classList.remove('hidden');
    }
    loadingSpinner.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  // 데이터 로드
  fetchMemos();

  // 실시간 구독 (다른 사람이 메모를 남기면 새로고침 없이 즉시 반영!)
  subscribeToMemos();

  // 모달 열기/닫기 이벤트
  if (openModalBtn) openModalBtn.addEventListener('click', openModal);
  if (fabBtn) fabBtn.addEventListener('click', openModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  // 폼 제출 이벤트
  if (memoForm) memoForm.addEventListener('submit', handleFormSubmit);

  // 글자 수 카운터
  if (contentInput && charCount) {
    contentInput.addEventListener('input', () => {
      charCount.textContent = contentInput.value.length;
    });
  }

  // 새로고침 버튼
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchMemos();
    });
  }

  // 검색 필터
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        renderMemos(allMemos);
        return;
      }
      const filtered = allMemos.filter((memo) => {
        const author = (memo.author || '').toLowerCase();
        const relation = (memo.relationship || '').toLowerCase();
        const content = (memo.content || '').toLowerCase();
        return author.includes(query) || relation.includes(query) || content.includes(query);
      });
      renderMemos(filtered);
    });
  }
});

// ==========================================
// 2. 데이터 가져오기 (SELECT)
// ==========================================
async function fetchMemos() {
  if (!supabaseClient) {
    loadingSpinner.classList.add('hidden');
    return;
  }

  try {
    loadingSpinner.classList.remove('hidden');
    memoGrid.innerHTML = '';
    emptyState.classList.add('hidden');

    const { data, error } = await supabaseClient
      .from('memos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('메모 로드 오류:', error);
      alert('메모를 불러오는 도중 오류가 발생했습니다: ' + error.message);
      return;
    }

    allMemos = data || [];
    renderMemos(allMemos);
  } catch (err) {
    console.error('네트워크 오류:', err);
  } finally {
    loadingSpinner.classList.add('hidden');
  }
}

// ==========================================
// 3. 포스트잇 렌더링
// ==========================================
function renderMemos(memos) {
  memoGrid.innerHTML = '';
  if (memoCountEl) memoCountEl.textContent = memos.length;

  if (memos.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  memos.forEach((memo) => {
    const card = document.createElement('div');
    const colorClass = memo.color ? `color-${memo.color}` : 'color-yellow';
    card.className = `postit-card ${colorClass}`;

    // 날짜 포맷팅 (YYYY. MM. DD.)
    const date = new Date(memo.created_at);
    const dateFormatted = `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;

    // XSS 방지용 이스케이프 함수 적용
    const safeAuthor = escapeHtml(memo.author);
    const safeRelation = memo.relationship ? escapeHtml(memo.relationship) : '';
    const safeContent = escapeHtml(memo.content);
    const safeEmoji = escapeHtml(memo.emoji || '🎓');

    card.innerHTML = `
      <div class="postit-header">
        <span class="postit-emoji">${safeEmoji}</span>
        <span class="postit-date">${dateFormatted}</span>
      </div>
      <div class="postit-content">${safeContent}</div>
      <div class="postit-footer">
        <div class="author-info">
          <span class="author-name">${safeAuthor}</span>
          ${safeRelation ? `<span class="author-relation">${safeRelation}</span>` : ''}
        </div>
      </div>
    `;

    memoGrid.appendChild(card);
  });
}

// ==========================================
// 4. 메모 저장하기 (INSERT)
// ==========================================
async function handleFormSubmit(e) {
  e.preventDefault();
  if (!supabaseClient) {
    alert('Supabase 연동이 완료되지 않았습니다.');
    return;
  }

  const author = document.getElementById('authorInput').value.trim();
  const relationship = document.getElementById('relationshipInput').value.trim();
  const content = document.getElementById('contentInput').value.trim();
  const emoji = document.querySelector('input[name="emoji"]:checked')?.value || '🎓';
  const color = document.querySelector('input[name="color"]:checked')?.value || 'yellow';

  if (!author || !content) {
    alert('이름과 메모 내용을 모두 입력해주세요!');
    return;
  }

  // 버튼 비활성화 (중복 제출 방지)
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> 붙이는 중...';

  try {
    const { data, error } = await supabaseClient
      .from('memos')
      .insert([
        {
          author: author,
          relationship: relationship || null,
          content: content,
          emoji: emoji,
          color: color
        }
      ])
      .select();

    if (error) {
      console.error('메모 등록 오류:', error);
      alert('메모 저장에 실패했습니다: ' + error.message);
      return;
    }

    // 성공 시 축하 꽃가루 폭죽(Confetti) 터뜨리기! 🎉
    triggerConfetti();

    // 폼 초기화 및 모달 닫기
    memoForm.reset();
    if (charCount) charCount.textContent = '0';
    closeModal();

    // 목록 새로고침
    await fetchMemos();
  } catch (err) {
    console.error('제출 에러:', err);
    alert('메모를 전송하는 중 문제가 발생했습니다.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>✨</span> 롤링페이퍼에 붙이기';
  }
}

// ==========================================
// 5. 실시간 동기화 (Supabase Realtime)
// ==========================================
function subscribeToMemos() {
  if (!supabaseClient) return;

  try {
    supabaseClient
      .channel('public:memos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memos' }, (payload) => {
        // 새로운 글이 추가되면 전체 목록 최상단에 추가
        const newMemo = payload.new;
        const alreadyExists = allMemos.some((m) => m.id === newMemo.id);
        if (!alreadyExists) {
          allMemos.unshift(newMemo);
          renderMemos(allMemos);
        }
      })
      .subscribe();
  } catch (err) {
    console.warn('Realtime 연결 실패 (기본 조작에는 문제 없음):', err);
  }
}

// ==========================================
// 6. UI 보조 함수들 (모달, 폭죽 효과, XSS 방지)
// ==========================================
function openModal() {
  modalBackdrop.classList.add('active');
  document.getElementById('authorInput').focus();
}

function closeModal() {
  modalBackdrop.classList.remove('active');
}

// 폭죽 효과 (Canvas Confetti)
function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// HTML 특수문자 이스케이프 (보안 및 XSS 공격 방지)
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, (m) => map[m]);
}
