import { NextResponse } from 'next/server';

// 정적 대학 데이터 import
import universities from '../../../../data/universities.json';

/**
 * 특정 대학의 학과 목록 가져오기 (한국대학교육협의회 API)
 * GET /api/university/majors?university=서울대학교
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const university = searchParams.get('university');

    if (!university || university.trim() === '') {
        return NextResponse.json({
            success: false,
            message: '대학명을 입력하세요'
        }, { status: 400 });
    }

    // 한국대학교육협의회 API 키 (우선순위 1)
    const UNIV_API_KEY = process.env.UNIV_API_KEY;
    // 커리어넷 API 키 (폴백용)
    const CAREERNET_API_KEY = process.env.CAREERNET_API_KEY;

    try {
        let majors = [];
        let apiUsed = '';

        // 정적 데이터 확인 (CSV 변환된 데이터)
        if (universities[university]) {
            console.log(`🎓 정적 데이터에서 학과 검색: ${university}`);

            majors = universities[university].majors.map(major => ({
                name: major.name,
                field: major.largeCategory || major.college || '기타',
                facilName: university,
                majorSeq: '',
                college: major.college,
                description: major.description,
                dayNight: major.dayNight,
                majorCharacteristic: major.majorCharacteristic,
                studyDuration: major.studyDuration,
                degreeProgram: major.degreeProgram
            }));

            apiUsed = '정적 데이터 (CSV 변환)';
            console.log(`✅ ${apiUsed} 검색 결과: ${majors.length}개 학과`);
        }

        // 1차 시도: 한국대학교육협의회 API (대학별 학과 정확 조회) - 캐시 실패 시만
        if (majors.length === 0 && UNIV_API_KEY && UNIV_API_KEY !== 'your_univ_api_key_here') {
            try {
                const currentYear = new Date().getFullYear();
                const apiUrl = `http://openapi.academyinfo.go.kr/openapi/service/rest/SchoolMajorInfoService/getSchoolMajorInfo?serviceKey=${encodeURIComponent(UNIV_API_KEY)}&schlKrnNm=${encodeURIComponent(university)}&svyYr=${currentYear}&pageNo=1&numOfRows=999`;
                
                console.log(`🎓 한국대학교육협의회 API로 학과 검색: ${university}`);
                console.log(`🎓 한국대학교육협의회 API로 학과 검색: ${apiUrl}`);

                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw new Error(`API 응답 오류: ${response.status}`);
                }

                const xmlText = await response.text();

                // XML 파싱 (간단한 정규식 사용)
                const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/g);
                const majorMap = new Map();

                for (const match of itemMatches) {
                    const itemXml = match[1];

                    // 학과명 추출
                    const majorNameMatch = itemXml.match(/<korMjrNm>(.*?)<\/korMjrNm>/);
                    const majorName = majorNameMatch ? majorNameMatch[1].trim() : '';

                    // 학과 특성 추출 (계열 정보로 사용)
                    const fieldMatch = itemXml.match(/<schlMjrCharNm>(.*?)<\/schlMjrCharNm>/);
                    const field = fieldMatch ? fieldMatch[1].trim() : '일반과정';

                    if (majorName && !majorMap.has(majorName)) {
                        majorMap.set(majorName, {
                            name: majorName,
                            field: field,
                            facilName: university,
                            majorSeq: ''
                        });
                    }
                }

                majors = Array.from(majorMap.values());
                apiUsed = '한국대학교육협의회 API';

                console.log(`✅ ${apiUsed} 검색 결과: ${majors.length}개 학과`);

            } catch (error) {
                console.warn(`⚠️  한국대학교육협의회 API 오류: ${error.message}`);
                // 폴백으로 커리어넷 API 시도
            }
        }

        // 2차 시도: 커리어넷 API (폴백)
        if (majors.length === 0 && CAREERNET_API_KEY && CAREERNET_API_KEY !== 'your_careernet_api_key_here') {
            try {
                const apiUrl = `https://www.career.go.kr/cnet/openapi/getOpenApi.json?apiKey=${CAREERNET_API_KEY}&svcType=api&svcCode=MAJOR&contentType=json&gubun=대학교&searchTitle=${encodeURIComponent(university)}&thisPage=1&perPage=500`;

                console.log(`🎓 커리어넷 API로 학과 검색 (폴백): ${university}`);

                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw new Error(`API 응답 오류: ${response.status}`);
                }

                const data = await response.json();

                // API 응답에서 학과 정보 추출
                let allMajors = [];

                if (data.dataSearch?.content) {
                    allMajors = Array.isArray(data.dataSearch.content) ? data.dataSearch.content : [data.dataSearch.content];
                }

                // 대학명으로 필터링 (서버 사이드)
                const filteredMajors = allMajors.filter(major => {
                    const facilName = (major.facilName || '').toLowerCase();
                    const searchUniv = university.toLowerCase().replace(/대학교$/, '');
                    return facilName.includes(searchUniv) || facilName.includes(university.toLowerCase());
                });

                // 응답 형식 변환 및 중복 제거
                const majorMap = new Map();

                filteredMajors.forEach(major => {
                    const majorName = major.mClass || '';
                    const field = major.lClass || '';

                    if (majorName && !majorMap.has(majorName)) {
                        majorMap.set(majorName, {
                            name: majorName,
                            field: field,
                            facilName: major.facilName || '',
                            majorSeq: major.majorSeq || ''
                        });
                    }
                });

                majors = Array.from(majorMap.values());
                apiUsed = '커리어넷 API (서버 필터링)';

                console.log(`✅ ${apiUsed} 검색 결과: ${majors.length}개 학과`);

            } catch (error) {
                console.error(`❌ 커리어넷 API 오류: ${error.message}`);
            }
        }

        // 3차 시도: 정적 데이터 (최종 폴백)
        if (majors.length === 0 && staticUniversityMajors) {
            console.log(`🎓 정적 데이터에서 학과 검색: ${university}`);

            // 정확한 매칭 시도
            if (staticUniversityMajors[university]) {
                majors = staticUniversityMajors[university].map(major => ({
                    name: major.name,
                    field: major.field,
                    facilName: university,
                    majorSeq: ''
                }));
                apiUsed = '정적 데이터 (정확 매칭)';
            } else {
                // 부분 매칭 시도 (예: "경남정보대학" → "경남정보대학교")
                const searchUniv = university.toLowerCase().replace(/대학교$/, '');
                const matchedKey = Object.keys(staticUniversityMajors).find(key => {
                    const keyLower = key.toLowerCase().replace(/대학교$/, '');
                    return keyLower.includes(searchUniv) || searchUniv.includes(keyLower);
                });

                if (matchedKey) {
                    majors = staticUniversityMajors[matchedKey].map(major => ({
                        name: major.name,
                        field: major.field,
                        facilName: matchedKey,
                        majorSeq: ''
                    }));
                    apiUsed = '정적 데이터 (부분 매칭)';
                }
            }

            if (majors.length > 0) {
                console.log(`✅ ${apiUsed} 검색 결과: ${majors.length}개 학과`);
            }
        }

        // API 키가 없거나 모든 시도 실패
        if (majors.length === 0 && !apiUsed) {
            return NextResponse.json({
                success: false,
                message: '학과 정보를 찾을 수 없습니다.',
                hint: '대학명을 정확히 입력했는지 확인하거나, .env 파일에 UNIV_API_KEY를 설정하세요.',
                searched: university
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            count: majors.length,
            majors: majors,
            apiUsed: apiUsed || 'none'
        });

    } catch (error) {
        console.error('❌ 대학 학과 검색 API 오류:', error);
        return NextResponse.json({
            success: false,
            message: 'API 호출 실패',
            error: error.message
        }, { status: 500 });
    }
}