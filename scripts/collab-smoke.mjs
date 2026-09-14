// crowfoot-collab 실측 — 두 클라이언트(앨리스·밥)로 presence·저장 푸시·연결 해제 정리를 확인한다
import { Client } from '@stomp/stompjs';

// SockJS 엔드포인트 /ws 를 켰다 — 네이티브 WebSocket 전송은 /ws/websocket 에 붙는다
const URL = 'ws://localhost:8083/ws/websocket';
const MODEL = 'smoke-1';

function makeClient(userId, userName) {
  return new Client({
    brokerURL: `${URL}`,
    connectHeaders: { 'X-USER-ID': userId, 'X-USER-NAME': userName },
    reconnectDelay: 0, // 실측 — 재접속 금지
  });
}

const log = (who, msg) => console.log(`[${who}] ${msg}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const alice = makeClient('alice', '앨리스');
const bob = makeClient('bob', '밥');

await Promise.race([
  new Promise((resolve, reject) => {
    alice.onConnect = resolve;
    alice.onStompError = (f) => reject(new Error('앨리스 STOMP 오류: ' + f.headers.message));
    alice.onWebSocketClose = () => reject(new Error('앨리스 웹소켓 닫힘(연결 실패)'));
    alice.activate();
  }),
  wait(5000).then(() => {
    throw new Error('앨리스 연결 5초 시간 초과');
  }),
]);
log('alice', 'CONNECTED');

alice.subscribe(`/topic/models/${MODEL}/presence`, (m) => {
  const body = JSON.parse(m.body);
  log('alice', `presence ${body.type} ${body.userId} → 참가자 [${body.participants.map((p) => p.userId).join(', ')}]`);
});
alice.subscribe(`/topic/models/${MODEL}/version`, (m) => {
  const body = JSON.parse(m.body);
  log('alice', `version ${body.version} savedBy=${body.savedBy}(${body.savedByName}) at=${body.at}`);
});
await wait(300);

alice.publish({ destination: `/app/models/${MODEL}/join`, body: '' });
await wait(300);

await new Promise((resolve) => { bob.onConnect = resolve; bob.activate(); });
log('bob', 'CONNECTED');
bob.subscribe(`/topic/models/${MODEL}/presence`, (m) => {
  const body = JSON.parse(m.body);
  log('bob', `presence ${body.type} ${body.userId} → [${body.participants.map((p) => p.userId).join(', ')}]`);
});
await wait(300);
bob.publish({ destination: `/app/models/${MODEL}/join`, body: '' });
await wait(300);

bob.publish({ destination: `/app/models/${MODEL}/saved`, body: JSON.stringify({ version: 553 }) });
await wait(300);

bob.deactivate(); // leave 프레임 없이 끊기 — disconnect 정리 확인
log('bob', 'DEACTIVATED');
await wait(700);

alice.deactivate();
console.log('== 실측 종료 ==');
