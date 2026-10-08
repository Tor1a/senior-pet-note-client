// 탈퇴 뒤 이 브라우저에 남은 앱 설정(spn.* 키)을 지운다. 개인 정보는 아니지만 "모두 지웠어요" 안내와 맞추기 위해서다.
// 토큰은 tokenStorage.clearToken 이 따로 지운다.
export function clearLocalAppData(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('spn.')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage 를 못 쓰면 지울 것도 없다
  }
}
