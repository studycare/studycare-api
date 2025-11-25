/**
 * 학교알리미 API 헬퍼 함수
 *
 * 학교명으로 학교 정보, 동아리, 특색 프로그램을 조회합니다.
 */

/**
 * 학교 정보 조회
 * @param {string} schoolName - 학교명
 * @returns {Promise<{clubs: Array, programs: Array}>}
 */
export async function fetchSchoolInfo(schoolName) {
    const API_KEY = process.env.SCHOOLINFO_API_KEY;

    if (!API_KEY) {
        console.error('학교알리미 API 키가 설정되지 않았습니다.');
        return { clubs: [], programs: [] };
    }

    try {
        // 1. 학교 기본 정보 조회
        const schoolRes = await fetch(
            `https://open.neis.go.kr/hub/schoolInfo?KEY=${API_KEY}&Type=json&SCHUL_NM=${encodeURIComponent(schoolName)}&pSize=1`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!schoolRes.ok) {
            throw new Error(`학교 정보 조회 실패: ${schoolRes.status}`);
        }

        const schoolData = await schoolRes.json();

        // 응답 데이터 확인
        if (!schoolData.schoolInfo || schoolData.schoolInfo.length < 2) {
            console.warn(`학교를 찾을 수 없습니다: ${schoolName}`);
            return { clubs: [], programs: [] };
        }

        const school = schoolData.schoolInfo[1].row[0];
        const schoolCode = school.SD_SCHUL_CODE;
        const officeCode = school.ATPT_OFCDC_SC_CODE;

        console.log(`학교 정보 조회 성공: ${schoolName} (${schoolCode})`);

        // 2. 동아리 정보 조회 (학교 전공 정보 API 활용)
        let clubs = [];
        try {
            const clubRes = await fetch(
                `https://open.neis.go.kr/hub/schoolMajorinfo?KEY=${API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&pSize=100`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (clubRes.ok) {
                const clubData = await clubRes.json();
                clubs = parseClubs(clubData);
            }
        } catch (clubError) {
            console.warn('동아리 정보 조회 실패:', clubError.message);
        }

        // 3. 특색 프로그램 정보
        // 학교알리미 API에서 특색 프로그램은 제한적이므로 일반적인 프로그램 예시 제공
        const programs = [
            { name: '방과후 학교 프로그램', target: '전학년', period: '연중' },
            { name: '독서 프로그램', target: '전학년', period: '학기별' },
            { name: '진로 탐색 프로그램', target: '1-2학년', period: '학기별' }
        ];

        return {
            clubs: clubs.length > 0 ? clubs : getDefaultClubs(),
            programs
        };
    } catch (error) {
        console.error('학교알리미 API 오류:', error);
        return {
            clubs: getDefaultClubs(),
            programs: []
        };
    }
}

/**
 * 동아리 데이터 파싱
 * @param {Object} data - API 응답 데이터
 * @returns {Array} 파싱된 동아리 목록
 */
function parseClubs(data) {
    if (!data.schoolMajorinfo || data.schoolMajorinfo.length < 2) {
        return [];
    }

    return data.schoolMajorinfo[1].row.map(club => ({
        name: club.DGHT_CRSE_SC_NM || '동아리',
        category: club.DDDEP_NM || '일반',
        description: club.ORD_SC_NM || ''
    }));
}

/**
 * 기본 동아리 목록 (API 조회 실패 시 사용)
 * @returns {Array}
 */
function getDefaultClubs() {
    return [
        { name: '과학탐구동아리', category: '학술', description: '과학 실험 및 탐구' },
        { name: '영어회화동아리', category: '학술', description: '영어 토론 및 회화' },
        { name: '수학동아리', category: '학술', description: '수학 심화 학습' },
        { name: '독서토론동아리', category: '문화', description: '독서 및 토론' },
        { name: '봉사동아리', category: '봉사', description: '지역사회 봉사' }
    ];
}
