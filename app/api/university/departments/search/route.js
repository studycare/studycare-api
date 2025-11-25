import { NextResponse } from 'next/server';

/**
 * 대학 학과/전공 검색 (커리어넷 API)
 * GET /api/university/departments/search?query=컴퓨터
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

    const API_KEY = process.env.CAREERNET_API_KEY;

    if (!API_KEY || API_KEY === 'your_careernet_api_key_here') {
        console.error('커리어넷 API 키가 설정되지 않았습니다.');
        return NextResponse.json({
            success: false,
            message: '커리어넷 API 키가 설정되지 않았습니다. .env 파일에서 CAREERNET_API_KEY를 설정해주세요.'
        }, { status: 500 });
    }

    try {
        // 커리어넷 API 호출 (대학 학과정보 - JSON 형식)
        const apiUrl = `https://www.career.go.kr/cnet/openapi/getOpenApi.json?apiKey=${API_KEY}&svcType=api&svcCode=MAJOR&contentType=json&gubun=univ_list&searchTitle=${encodeURIComponent(query)}&thisPage=1&perPage=50`;

        console.log(`🔍 대학 학과 검색: ${query}`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`API 응답 오류: ${response.status}`);
        }

        const data = await response.json();

        console.log('📡 커리어넷 API 응답:', JSON.stringify(data).substring(0, 300));

        // API 응답 확인 및 파싱
        if (data.dataSearch && data.dataSearch.content) {
            const departments = data.dataSearch.content;

            console.log(`✅ 검색 결과: ${departments.length}개 학과`);

            // 응답 형식 변환 (필요한 정보만 추출)
            const formattedDepartments = departments.map(dept => ({
                name: dept.mClass || dept.majorName || '',
                university: dept.schoolName || '',
                field: dept.lClass || '',
                category: dept.majorSeq || '',
                description: dept.summary || ''
            }));

            return NextResponse.json({
                success: true,
                count: formattedDepartments.length,
                departments: formattedDepartments
            });
        } else {
            console.warn('검색 결과 없음 또는 잘못된 응답 형식');
            return NextResponse.json({
                success: true,
                count: 0,
                departments: []
            });
        }
    } catch (error) {
        console.error('❌ 대학 학과 검색 API 오류:', error);
        return NextResponse.json({
            success: false,
            message: 'API 호출 실패',
            error: error.message
        }, { status: 500 });
    }
}

// OPTIONS 메서드 처리 (CORS preflight)
export async function OPTIONS() {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}