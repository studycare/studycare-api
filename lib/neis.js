/**
 * 나이스(NEIS) 교육정보 개방 포털 API 헬퍼 함수
 *
 * 전국 초중고등학교의 교육정보를 조회합니다.
 * - 학교 기본정보
 * - 학사일정
 * - 급식 정보
 * - 교육과정 정보
 *
 * API 문서: https://open.neis.go.kr/portal/guide/apiGuidePage.do
 */

const NEIS_BASE_URL = 'https://open.neis.go.kr/hub';

/**
 * 나이스 API 공통 호출 함수
 * @param {string} endpoint - API 엔드포인트 (예: 'schoolInfo')
 * @param {Object} params - 쿼리 파라미터
 * @returns {Promise<Object>}
 */
async function callNeisAPI(endpoint, params = {}) {
    const API_KEY = process.env.NEIS_API_KEY;

    if (!API_KEY || API_KEY === 'YOUR_NEIS_API_KEY_HERE') {
        console.error('나이스 API 키가 설정되지 않았습니다. .env 파일에서 NEIS_API_KEY를 설정하세요.');
        return null;
    }

    // 기본 파라미터 설정
    const queryParams = new URLSearchParams({
        KEY: API_KEY,
        Type: 'json',
        pSize: 100,
        ...params
    });

    const url = `${NEIS_BASE_URL}/${endpoint}?${queryParams.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`나이스 API 오류: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`나이스 API 호출 실패 (${endpoint}):`, error.message);
        return null;
    }
}

/**
 * 학교 기본정보 조회
 * @param {string} schoolName - 학교명
 * @returns {Promise<Object>} 학교 정보 (교육청코드, 학교코드 등)
 */
export async function getSchoolInfo(schoolName) {
    const data = await callNeisAPI('schoolInfo', {
        SCHUL_NM: schoolName
    });

    if (!data || !data.schoolInfo || data.schoolInfo.length < 2) {
        console.warn(`학교를 찾을 수 없습니다: ${schoolName}`);
        return null;
    }

    const school = data.schoolInfo[1].row[0];

    return {
        schoolName: school.SCHUL_NM,                    // 학교명
        officeCode: school.ATPT_OFCDC_SC_CODE,          // 교육청코드
        schoolCode: school.SD_SCHUL_CODE,               // 학교코드
        schoolType: school.SCHUL_KND_SC_NM,             // 학교종류명 (초/중/고)
        address: school.ORG_RDNMA,                      // 도로명주소
        foundationDay: school.FOND_YMD,                 // 개교기념일
        homepage: school.HMPG_ADRES,                    // 홈페이지주소
        telNumber: school.ORG_TELNO,                    // 전화번호
        establishType: school.FOND_SC_NM                // 설립유형 (공립/사립)
    };
}

/**
 * 학교 교육과정 정보 조회 (학교별 교과목 편성)
 * @param {string} officeCode - 교육청코드
 * @param {string} schoolCode - 학교코드
 * @param {string} year - 학년도 (예: '2024')
 * @returns {Promise<Array>}
 */
export async function getSchoolCurriculum(officeCode, schoolCode, year = new Date().getFullYear().toString()) {
    const data = await callNeisAPI('spsTimetable', {
        ATPT_OFCDC_SC_CODE: officeCode,
        SD_SCHUL_CODE: schoolCode,
        AY: year
    });

    if (!data || !data.spsTimetable || data.spsTimetable.length < 2) {
        console.warn('교육과정 정보를 찾을 수 없습니다.');
        return [];
    }

    return data.spsTimetable[1].row.map(course => ({
        grade: course.GRADE,                            // 학년
        semester: course.SEM,                           // 학기
        courseType: course.DDDEP_NM,                    // 계열명
        subjectName: course.ORD_SC_NM,                  // 과목명
        unitCount: course.DGHT_CRSE_SC_NM              // 단위수
    }));
}

/**
 * 학교 학과(전공) 정보 조회
 * @param {string} officeCode - 교육청코드
 * @param {string} schoolCode - 학교코드
 * @returns {Promise<Array>}
 */
export async function getSchoolMajors(officeCode, schoolCode) {
    const data = await callNeisAPI('schoolMajorinfo', {
        ATPT_OFCDC_SC_CODE: officeCode,
        SD_SCHUL_CODE: schoolCode
    });

    if (!data || !data.schoolMajorinfo || data.schoolMajorinfo.length < 2) {
        console.warn('학과 정보를 찾을 수 없습니다.');
        return [];
    }

    return data.schoolMajorinfo[1].row.map(major => ({
        departmentName: major.DDDEP_NM,                 // 학과명
        courseType: major.DGHT_CRSE_SC_NM,              // 계열명
        majorField: major.ORD_SC_NM                     // 전공분야명
    }));
}

/**
 * 학교 학사일정 조회 (토요휴업일, 방학 제외)
 * @param {string} officeCode - 교육청코드
 * @param {string} schoolCode - 학교코드
 * @param {string} year - 년도 (예: '2024')
 * @param {string} month - 월 (예: '03', 선택사항)
 * @returns {Promise<Array>}
 */
export async function getSchoolSchedule(officeCode, schoolCode, year = new Date().getFullYear().toString(), month = null) {
    const params = {
        ATPT_OFCDC_SC_CODE: officeCode,
        SD_SCHUL_CODE: schoolCode,
        AA_YMD: month ? `${year}${month}` : year,
        pSize: 1000  // 최대 1000개까지 조회
    };

    const data = await callNeisAPI('SchoolSchedule', params);

    if (!data || !data.SchoolSchedule || data.SchoolSchedule.length < 2) {
        console.warn('학사일정 정보를 찾을 수 없습니다.');
        return [];
    }

    // 토요휴업일, 방학 제외 필터링
    return data.SchoolSchedule[1].row
        .filter(schedule => {
            const eventName = schedule.EVENT_NM || '';
            const eventContent = schedule.EVENT_CNTNT || '';

            // 제외할 키워드
            const excludeKeywords = [
                '토요휴업일',
                '여름방학',
                '겨울방학',
                '봄방학',
                '가을방학',
                '방학식',
                '개학식'
            ];

            // 이벤트명이나 내용에 제외 키워드가 포함되어 있으면 제외
            return !excludeKeywords.some(keyword =>
                eventName.includes(keyword) || eventContent.includes(keyword)
            );
        })
        .map(schedule => ({
            date: schedule.AA_YMD,                          // 학사일자
            eventName: schedule.EVENT_NM,                   // 행사명
            eventContent: schedule.EVENT_CNTNT,             // 행사내용
            eventType: schedule.SBTR_DD_SC_NM,              // 수업공제일명
            grade: schedule.ONE_GRADE_EVENT_YN === 'Y' ? '1학년' :
                   schedule.TW_GRADE_EVENT_YN === 'Y' ? '2학년' :
                   schedule.THREE_GRADE_EVENT_YN === 'Y' ? '3학년' : '전학년'
        }));
}

/**
 * 급식 식단 정보 조회
 * @param {string} officeCode - 교육청코드
 * @param {string} schoolCode - 학교코드
 * @param {string} date - 날짜 (예: '20240315', YYYYMMDD 형식)
 * @returns {Promise<Array>}
 */
export async function getMealInfo(officeCode, schoolCode, date = null) {
    const today = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const data = await callNeisAPI('mealServiceDietInfo', {
        ATPT_OFCDC_SC_CODE: officeCode,
        SD_SCHUL_CODE: schoolCode,
        MLSV_YMD: today
    });

    if (!data || !data.mealServiceDietInfo || data.mealServiceDietInfo.length < 2) {
        console.warn('급식 정보를 찾을 수 없습니다.');
        return [];
    }

    return data.mealServiceDietInfo[1].row.map(meal => ({
        date: meal.MLSV_YMD,                            // 급식일자
        mealType: meal.MMEAL_SC_NM,                     // 식사구분 (조식/중식/석식)
        menu: meal.DDISH_NM.split('<br/>'),             // 메뉴 (배열)
        calories: meal.CAL_INFO,                        // 칼로리정보
        nutrients: meal.NTR_INFO,                       // 영양정보
        origin: meal.ORPLC_INFO                         // 원산지정보
    }));
}

/**
 * 학교명으로 종합 정보 조회 (통합 함수)
 * @param {string} schoolName - 학교명
 * @returns {Promise<Object>}
 */
export async function getComprehensiveSchoolInfo(schoolName) {
    console.log(`🔍 ${schoolName} 정보 조회 중...`);

    // 1. 학교 기본정보 조회
    const schoolInfo = await getSchoolInfo(schoolName);

    if (!schoolInfo) {
        return {
            error: '학교를 찾을 수 없습니다.',
            schoolName
        };
    }

    const { officeCode, schoolCode } = schoolInfo;
    const currentYear = new Date().getFullYear().toString();

    // 2. 병렬로 추가 정보 조회
    const [curriculum, majors, schedule] = await Promise.all([
        getSchoolCurriculum(officeCode, schoolCode, currentYear),
        getSchoolMajors(officeCode, schoolCode),
        getSchoolSchedule(officeCode, schoolCode, currentYear)
    ]);

    return {
        basicInfo: schoolInfo,
        curriculum: curriculum || [],
        majors: majors || [],
        schedule: schedule || [],
        summary: {
            schoolName: schoolInfo.schoolName,
            type: schoolInfo.schoolType,
            address: schoolInfo.address,
            curriculumCount: curriculum?.length || 0,
            majorCount: majors?.length || 0,
            upcomingEventsCount: schedule?.length || 0
        }
    };
}
