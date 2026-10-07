// 푸시 "비활성" 구현: 웹 미리보기(expo start --web)와 RNFB 를 쓸 수 없는 곳에서 쓴다.
// 네이티브에서는 Metro 가 push.native.ts 를 대신 고른다. 웹 번들에 RNFB 가 들어가지 않게 파일을 나눴다.
// 비활성 구현 본체는 pushDisabled.ts (push.native.ts 가 './push' 를 부르면 자기 자신이 되어 순환 참조가 생긴다).
export { push } from './pushDisabled';
