# crowfoot-web — CI에서 pnpm build한 정적 산출물(dist)을 nginx로 서빙
FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html
EXPOSE 80
