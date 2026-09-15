# crowfoot-web — CI에서 pnpm build한 정적 산출물(dist)을 nginx로 서빙
FROM nginx:1.27-alpine
# 서버 시간대 — nginx access/error 로그 타임스탬프를 KST로 (alpine은 tzdata 설치 필요)
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html
EXPOSE 80
