import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 로깅 프록시
 * 모든 요청을 콘솔에 기록
 */
export function proxy(request: NextRequest) {
    const timestamp = new Date().toISOString();
    const method = request.method;
    const path = request.nextUrl.pathname;

    console.log(`[${timestamp}] ${method} ${path}`);

    // 쿼리 파라미터가 있으면 함께 로깅
    const searchParams = request.nextUrl.searchParams.toString();
    if (searchParams) {
        console.log(`  Query: ${searchParams}`);
    }

    // API 요청에 CORS 헤더 추가
    if (path.startsWith('/api/')) {
        const response = NextResponse.next();
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return response;
    }

    // 요청 계속 진행
    return NextResponse.next();
}

/**
 * 프록시가 적용될 경로 설정
 * _next, api, static 파일을 제외한 모든 경로
 */
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|public).*)',
    ],
};