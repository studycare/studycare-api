import { NextResponse } from 'next/server';

/**
 * 대학 검색 (커리어넷 API - 대학 정보)
 * GET /api/university/search?query=서울대
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
            message: '커리어넷 API 키가 설정되지 않았습니다.'
        }, { status: 500 });
    }

    try {
        // 커리어넷 API 호출 (대학 정보 - JSON 형식)
        const apiUrl = `https://www.career.go.kr/cnet/openapi/getOpenApi.json?apiKey=${API_KEY}&svcType=api&svcCode=SCHOOL&contentType=json&gubun=univ_list&searchSchulNm=${encodeURIComponent(query)}&thisPage=1&perPage=100`;

        console.log(`🔍 대학 검색: ${query}`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`API 응답 오류: ${response.status}`);
        }

        const data = await response.json();

        console.log('📡 커리어넷 API 응답 수신 완료');

        // API 응답에서 대학 정보 추출
        let universities = [];

        if (data.dataSearch?.content && Array.isArray(data.dataSearch.content)) {
            universities = data.dataSearch.content;
        }

        console.log(`✅ 검색 결과: ${universities.length}개 대학`);

        // 응답 형식 변환 (필요한 정보만 추출)
        const formattedUniversities = universities.map(univ => ({
            name: univ.schoolName || '',
            type: univ.schoolGubun || '',
            location: univ.adres || '',
            region: univ.region || '',
            estType: univ.estType || '',
            link: univ.link || ''
        }));

        return NextResponse.json({
            success: true,
            count: formattedUniversities.length,
            universities: formattedUniversities
        });

    } catch (error) {
        console.error('❌ 대학 검색 API 오류:', error);
        return NextResponse.json({
            success: false,
            message: 'API 호출 실패',
            error: error.message
        }, { status: 500 });
    }
}