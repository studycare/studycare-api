import { fetchSchoolInfo } from '../../../lib/schoolinfo.js';
import { searchNaver } from '../../../lib/naver.js';
import { getUniversityMajorInfo } from '../../../lib/careernet.js';
import { streamOpenAI } from '../../../lib/openai-stream.js';

// 대학 학과 캐시 데이터 (실제로는 DB나 다른 저장소에서 가져와야 함)
let cachedUniversityMajors = [];

/**
 * 개별 섹션 생성 엔드포인트 (병렬 스트리밍용)
 * 텍스트만 전송하여 클라이언트에서 타이핑 효과 구현
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);

    // 응답 생성
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // 이벤트 전송 함수
            const sendEvent = (event, data) => {
                const formattedData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(formattedData));
            };

            // 비동기 처리 함수
            const processRequest = async () => {
                try {
                    // 쿼리 파라미터 파싱
                    if (!searchParams.get('data') || !searchParams.get('section')) {
                        sendEvent('error', { message: 'Missing required parameters' });
                        controller.close();
                        return;
                    }

                    const studentData = JSON.parse(searchParams.get('data'));
                    const section = searchParams.get('section');

                    console.log(`[${section}] 섹션 생성 시작: ${studentData.name}`);

                    // 타임아웃 설정
                    const timeout = setTimeout(() => {
                        sendEvent('error', { message: '응답 시간 초과' });
                        controller.close();
                    }, 120000); // 2분

                    try {
                        // 학교 데이터 및 네이버 검색 (캐시 사용 권장)
                        let schoolData, naverResults, careernetData;
                        try {
                            const promises = [
                                fetchSchoolInfo(studentData.schoolName).catch(() => ({ clubs: [], programs: [] })),
                                searchNaver(studentData.department, studentData.targets.university).catch(() => ({ activities: [], strategies: [], clubs: [] }))
                            ];

                            // university 섹션일 때만 커리어넷 API 호출 및 대학 추천 정보 생성
                            if (section === 'university') {
                                promises.push(
                                    getUniversityMajorInfo(studentData.targets.university, studentData.targets.major)
                                        .catch(() => null)
                                );

                                // 대학 추천 정보 추가 (동기 함수이므로 바로 실행)
                                const avgGrade = calculateGradeAverage(studentData);
                                const recommendations = getUniversityRecommendations(studentData.targets.major || studentData.department, avgGrade);

                                // careernetData에 추천 정보 추가
                                promises.push(Promise.resolve(recommendations));
                            }

                            const results = await Promise.all(promises);
                            schoolData = results[0];
                            naverResults = results[1];
                            careernetData = results[2] || null;

                            // university 섹션일 때 추천 정보 추가
                            if (section === 'university' && results[3]) {
                                const recommendations = results[3];
                                if (!careernetData) {
                                    careernetData = {};
                                }
                                careernetData.recommendations = recommendations;
                                console.log(`[${section}] 대학 추천 데이터 생성 완료: ${recommendations.totalCount || 0}개 관련 학과`);
                            }

                            if (careernetData && careernetData.hasData) {
                                console.log(`[${section}] 커리어넷 데이터 조회 성공`);
                            }
                        } catch (error) {
                            schoolData = { clubs: [], programs: [] };
                            naverResults = { activities: [], strategies: [], clubs: [] };
                            careernetData = null;
                        }

                        // 섹션별 텍스트 전용 스트리밍
                        await streamOpenAI((event, data) => {
                            sendEvent(event, data);
                        }, section, studentData, schoolData, naverResults, { textOnly: true, careernetData });

                        // 완료
                        sendEvent('done', { section });
                        console.log(`[${section}] 완료`);

                        clearTimeout(timeout);
                        controller.close();

                    } catch (error) {
                        console.error(`[${section}] 오류:`, error);
                        sendEvent('error', { message: error.message });
                        clearTimeout(timeout);
                        controller.close();
                    }

                } catch (error) {
                    console.error('데이터 파싱 오류:', error);
                    sendEvent('error', { message: 'Invalid data format: ' + error.message });
                    controller.close();
                }
            };

            // 비동기 처리 시작
            processRequest();
        }
    });

    return new Response(stream, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    });
}

// OPTIONS 메서드 처리 (CORS preflight)
export async function OPTIONS() {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}

/**
 * 대학 추천 정보 가져오기 (API2 캐시 활용)
 * @param {string} targetMajor - 목표 전공명
 * @param {number} avgGrade - 평균 등급
 * @returns {Object} 추천 대학 정보
 */
function getUniversityRecommendations(targetMajor, avgGrade) {
    // cachedUniversityMajors가 없으면 빈 결과 반환
    if (!cachedUniversityMajors || cachedUniversityMajors.length === 0) {
        return { recommendations: [], majorsList: [] };
    }

    try {
        // 1. 목표 전공과 관련된 학과 찾기
        const relatedMajors = cachedUniversityMajors.filter(item => {
            const majorName = item['학부_과(전공)명'] || item['학부·과(전공)명'] || '';
            const targetLower = targetMajor.toLowerCase();
            const majorLower = majorName.toLowerCase();

            // 전공명 유사도 검사
            return majorLower.includes(targetLower) ||
                   targetLower.includes(majorLower.replace(/과$|학과$|학부$/, ''));
        });

        // 2. 대학별로 그룹화
        const univGroups = {};
        relatedMajors.forEach(item => {
            const univName = item['학교명'];
            if (!univGroups[univName]) {
                univGroups[univName] = [];
            }
            univGroups[univName].push({
                major: item['학부_과(전공)명'] || item['학부·과(전공)명'],
                field: item['표준분류대계열'] || '기타'
            });
        });

        // 3. 대학 추천 (상향, 적정, 안정)
        const allUniversities = Object.keys(univGroups);
        const recommendations = {
            challenge: allUniversities.slice(0, 3),    // 상향 3개
            suitable: allUniversities.slice(3, 6),     // 적정 3개
            safe: allUniversities.slice(6, 9)          // 안정 3개
        };

        // 4. 전체 관련 학과 목록 (최대 20개)
        const majorsList = relatedMajors
            .slice(0, 20)
            .map(item => ({
                university: item['학교명'],
                major: item['학부_과(전공)명'] || item['학부·과(전공)명'],
                field: item['표준분류대계열'] || '기타'
            }));

        return {
            recommendations,
            majorsList,
            totalCount: relatedMajors.length
        };

    } catch (error) {
        console.error('대학 추천 정보 생성 오류:', error);
        return { recommendations: [], majorsList: [] };
    }
}

/**
 * 평균 등급 계산
 * @param {Object} studentData - 학생 데이터
 * @returns {number} 평균 등급
 */
function calculateGradeAverage(studentData) {
    const grades = [];

    // 기본 과목
    if (studentData.grades.korean) grades.push(parseFloat(studentData.grades.korean));
    if (studentData.grades.english) grades.push(parseFloat(studentData.grades.english));
    if (studentData.grades.math) grades.push(parseFloat(studentData.grades.math));

    // 추가 과목
    if (studentData.grades.additional && typeof studentData.grades.additional === 'object') {
        Object.values(studentData.grades.additional).forEach(grade => {
            if (grade) grades.push(parseFloat(grade));
        });
    }

    if (grades.length === 0) return 5.0;

    const sum = grades.reduce((a, b) => a + b, 0);
    return (sum / grades.length).toFixed(2);
}