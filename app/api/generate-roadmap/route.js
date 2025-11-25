import { fetchSchoolInfo } from '../../../lib/schoolinfo.js';
import { searchNaver } from '../../../lib/naver.js';
import { streamOpenAI } from '../../../lib/openai-stream.js';

/**
 * AI 로드맵 생성 엔드포인트 (SSE 스트리밍)
 * EventSource는 GET 메서드만 지원하므로 쿼리 파라미터로 데이터 수신
 */
export async function GET(request) {
    // 쿼리 파라미터에서 데이터 파싱
    const { searchParams } = new URL(request.url);

    // 응답 생성
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // CORS 헤더 설정
            const headers = new Headers({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no' // Nginx 버퍼링 비활성화
            });

            // 이벤트 전송 함수
            const sendEvent = (event, data) => {
                const formattedData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(formattedData));
            };

            // 비동기 처리 함수
            const processRequest = async () => {
                try {
                    // 데이터 파싱
                    if (!searchParams.get('data')) {
                        sendEvent('error', { message: 'Missing data parameter' });
                        controller.close();
                        return;
                    }

                    const studentData = JSON.parse(searchParams.get('data'));

                    // 필수 필드 검증
                    const required = ['name', 'schoolName', 'grade', 'department', 'grades', 'targets'];
                    for (const field of required) {
                        if (!studentData[field]) {
                            sendEvent('error', { message: `Missing required field: ${field}` });
                            controller.close();
                            return;
                        }
                    }

                    console.log(`로드맵 생성 시작: ${studentData.name} (${studentData.schoolName})`);

                    // 타임아웃 설정 (3분) - 속도 최적화
                    const timeout = setTimeout(() => {
                        sendEvent('error', { message: '응답 시간 초과 (3분). 다시 시도해주세요.' });
                        controller.close();
                    }, 180000);

                    try {
                        // ===== 단계0: 학교알리미 API 조회 (병렬 처리) =====
                        sendEvent('progress', { message: '데이터를 수집하고 있습니다...' });

                        let schoolData, naverResults;
                        try {
                            // 학교알리미와 네이버 검색을 병렬로 실행
                            [schoolData, naverResults] = await Promise.all([
                                fetchSchoolInfo(studentData.schoolName).catch(error => {
                                    console.warn('학교 정보 조회 실패:', error.message);
                                    return { clubs: [], programs: [] };
                                }),
                                searchNaver(studentData.department, studentData.targets.university).catch(error => {
                                    console.warn('네이버 검색 실패:', error.message);
                                    return { activities: [], strategies: [], clubs: [] };
                                })
                            ]);

                            sendEvent('school-data', schoolData);
                            console.log(`데이터 수집 완료: ${schoolData.clubs.length}개 동아리, ${naverResults.activities.length}개 검색 결과`);
                        } catch (error) {
                            console.warn('데이터 수집 실패:', error.message);
                            schoolData = { clubs: [], programs: [] };
                            naverResults = { activities: [], strategies: [], clubs: [] };
                        }

                        // ===== 단계1: SWOT 분석 =====
                        sendEvent('section-start', { section: 'swot', title: 'SWOT 분석' });
                        const swotResult = await streamOpenAI((event, data) => {
                            sendEvent(event, data);
                        }, 'swot', studentData, schoolData);

                        sendEvent('section-complete', { section: 'swot' });
                        console.log('SWOT 분석 완료');

                        // ===== 단계2: 종합 전략 (학습+활동 통합) =====
                        sendEvent('section-start', { section: 'strategy', title: '학습 및 활동 전략' });
                        const strategyResult = await streamOpenAI((event, data) => {
                            sendEvent(event, data);
                        }, 'strategy', studentData, schoolData, swotResult, naverResults);

                        sendEvent('section-complete', { section: 'strategy' });
                        console.log('종합 전략 완료');

                        // ===== 완료 =====
                        sendEvent('done', { message: '로드맵 생성 완료!' });
                        console.log(`로드맵 생성 완료: ${studentData.name}`);

                        clearTimeout(timeout);
                        controller.close();

                    } catch (error) {
                        console.error('로드맵 생성 오류:', error);
                        sendEvent('error', { message: error.message || '로드맵 생성 중 오류가 발생했습니다.' });
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