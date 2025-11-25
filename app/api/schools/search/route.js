import { NextResponse } from 'next/server';

/**
 * 학교 검색 엔드포인트
 * 나이스(NEIS) API를 통해 학교 검색
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query || query.trim() === '') {
        return NextResponse.json({
            success: false,
            message: '검색어를 입력하세요'
        }, { status: 400 });
    }

    const API_KEY = process.env.NEIS_API_KEY;

    if (!API_KEY || API_KEY === 'YOUR_NEIS_API_KEY_HERE') {
        console.error('나이스 API 키가 설정되지 않았습니다.');
        return NextResponse.json({
            success: false,
            message: '나이스 API 키가 설정되지 않았습니다.'
        }, { status: 500 });
    }

    try {
        // 나이스 API 호출 (학교 기본정보)
        const apiUrl = `https://open.neis.go.kr/hub/schoolInfo?KEY=${API_KEY}&Type=json&pIndex=1&pSize=100&SCHUL_NM=${encodeURIComponent(query)}`;

        console.log(`🔍 학교 검색: ${query}`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`API 응답 오류: ${response.status}`);
        }

        const data = await response.json();

        console.log('📡 나이스 API 응답:', JSON.stringify(data).substring(0, 200));

        // API 응답 확인
        if (data.schoolInfo && data.schoolInfo[1] && data.schoolInfo[1].row) {
            const schools = data.schoolInfo[1].row;

            // 중고등학교만 필터링
            const filteredSchools = schools.filter(school =>
                school.SCHUL_KND_SC_NM &&
                (school.SCHUL_KND_SC_NM.includes('중학교') ||
                 school.SCHUL_KND_SC_NM.includes('고등학교') ||
                 school.SCHUL_KND_SC_NM.includes('중') ||
                 school.SCHUL_KND_SC_NM.includes('고'))
            );

            console.log(`✅ 검색 결과: ${filteredSchools.length}개 학교`);

            return NextResponse.json({
                success: true,
                count: filteredSchools.length,
                schools: filteredSchools
            });
        } else if (data.RESULT) {
            // 에러 응답 처리
            console.error('나이스 API 오류:', data.RESULT);
            return NextResponse.json({
                success: false,
                message: data.RESULT.MESSAGE || '검색 결과가 없습니다',
                code: data.RESULT.CODE,
                schools: []
            });
        } else {
            console.warn('검색 결과 없음');
            return NextResponse.json({
                success: true,
                count: 0,
                schools: []
            });
        }
    } catch (error) {
        console.error('❌ 학교 검색 API 오류:', error);
        return NextResponse.json({
            success: false,
            message: 'API 호출 실패',
            error: error.message
        }, { status: 500 });
    }
}