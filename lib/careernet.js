/**
 * 커리어넷 API 통합 모듈
 * 대학 정보 및 학과 정보 조회 기능 제공
 */

import axios from 'axios';

const CAREERNET_BASE_URL = 'https://www.career.go.kr/cnet/openapi/getOpenApi.json';

/**
 * 커리어넷 API 기본 요청 함수
 */
async function fetchCareernetAPI(params) {
    const apiKey = process.env.CAREERNET_API_KEY;

    if (!apiKey) {
        console.warn('⚠️  커리어넷 API 키가 설정되지 않았습니다.');
        return null;
    }

    try {
        const queryParams = {
            apiKey,
            svcType: 'api',
            contentType: 'json',
            ...params
        };

        const response = await axios.get(CAREERNET_BASE_URL, {
            params: queryParams,
            timeout: 10000
        });

        if (response.data && response.data.dataSearch) {
            return response.data.dataSearch;
        }

        return null;
    } catch (error) {
        console.error('커리어넷 API 오류:', error.message);
        return null;
    }
}

/**
 * 대학 검색 (학교명으로 검색)
 * @param {string} schoolName - 검색할 대학명
 * @param {Object} options - 추가 옵션
 * @returns {Promise<Array>} 대학 정보 배열
 */
export async function searchUniversities(schoolName, options = {}) {
    const {
        schoolType = '100323', // 기본: 4년제 대학
        establishment = null,   // 국립(100334), 사립(100335), 공립(100336)
        perPage = 10
    } = options;

    const params = {
        svcCode: 'SCHOOL',
        gubun: '대학교',
        sch1: schoolType,
        searchSchulNm: schoolName,
        thisPage: 1,
        perPage
    };

    if (establishment) {
        params.est = establishment;
    }

    const data = await fetchCareernetAPI(params);

    if (data && data.content) {
        return Array.isArray(data.content) ? data.content : [data.content];
    }

    return [];
}

/**
 * 학과 정보 검색
 * @param {string} majorName - 검색할 학과명
 * @param {Object} options - 추가 옵션
 * @returns {Promise<Array>} 학과 정보 배열
 */
export async function searchMajors(majorName, options = {}) {
    const {
        gubun = '대학교',
        subject = null, // 계열 코드
        perPage = 10
    } = options;

    const params = {
        svcCode: 'MAJOR',
        gubun,
        searchTitle: majorName,
        thisPage: 1,
        perPage
    };

    if (subject) {
        params.subject = subject;
    }

    const data = await fetchCareernetAPI(params);

    if (data && data.content) {
        return Array.isArray(data.content) ? data.content : [data.content];
    }

    return [];
}

/**
 * 학과 상세 정보 조회
 * @param {string} majorSeq - 학과 코드
 * @returns {Promise<Object>} 학과 상세 정보
 */
export async function getMajorDetail(majorSeq) {
    const params = {
        svcCode: 'MAJOR_VIEW',
        majorSeq
    };

    const data = await fetchCareernetAPI(params);

    if (data && data.content) {
        return Array.isArray(data.content) ? data.content[0] : data.content;
    }

    return null;
}

/**
 * 학생의 목표 전공과 관련된 대학 및 학과 정보 조회
 * @param {string} universityName - 목표 대학명
 * @param {string} majorName - 목표 전공명
 * @returns {Promise<Object>} 대학 및 학과 정보
 */
export async function getUniversityMajorInfo(universityName, majorName) {
    try {
        // 병렬로 대학 정보와 학과 정보 조회
        const [universities, majors] = await Promise.all([
            searchUniversities(universityName),
            searchMajors(majorName)
        ]);

        // 학과 상세 정보 조회 (첫 번째 결과)
        let majorDetail = null;
        if (majors.length > 0 && majors[0].majorSeq) {
            majorDetail = await getMajorDetail(majors[0].majorSeq);
        }

        return {
            university: universities.length > 0 ? universities[0] : null,
            universities: universities.slice(0, 5), // 관련 대학 최대 5개
            major: majors.length > 0 ? majors[0] : null,
            majors: majors.slice(0, 5), // 관련 학과 최대 5개
            majorDetail,
            hasData: universities.length > 0 || majors.length > 0
        };
    } catch (error) {
        console.error('대학-학과 정보 조회 오류:', error.message);
        return {
            university: null,
            universities: [],
            major: null,
            majors: [],
            majorDetail: null,
            hasData: false
        };
    }
}

/**
 * 학생 성적 범위에 맞는 대학 추천
 * @param {number} avgGrade - 평균 등급
 * @param {string} majorName - 전공명
 * @returns {Promise<Object>} 추천 대학 정보
 */
export async function getRecommendedUniversities(avgGrade, majorName) {
    try {
        // 성적에 따른 대학 유형 결정
        const schoolTypes = [];

        if (avgGrade <= 2.0) {
            // 상위권 - 4년제 대학 위주
            schoolTypes.push('100323');
        } else if (avgGrade <= 4.0) {
            // 중위권 - 4년제 및 전문대학
            schoolTypes.push('100323', '100322');
        } else {
            // 하위권 - 전문대학 위주
            schoolTypes.push('100322', '100323');
        }

        // 각 학교 유형별로 검색
        const searchPromises = schoolTypes.map(type =>
            searchUniversities('', { schoolType: type, perPage: 20 })
        );

        const results = await Promise.all(searchPromises);
        const allUniversities = results.flat();

        // 지역별, 설립 유형별 다양성 확보
        const recommended = {
            reach: [], // 상향 (avgGrade - 1.0 수준)
            target: [], // 적정 (avgGrade ±0.3 수준)
            safety: [] // 안정 (avgGrade + 1.0 수준)
        };

        // 전공 정보 조회
        const majors = await searchMajors(majorName);

        return {
            recommended,
            majors: majors.slice(0, 10),
            totalUniversities: allUniversities.length,
            hasData: allUniversities.length > 0
        };
    } catch (error) {
        console.error('추천 대학 조회 오류:', error.message);
        return {
            recommended: { reach: [], target: [], safety: [] },
            majors: [],
            totalUniversities: 0,
            hasData: false
        };
    }
}

/**
 * 전공별 취업률 및 연봉 정보 조회
 * @param {string} majorName - 전공명
 * @returns {Promise<Object>} 취업 통계 정보
 */
export async function getMajorEmploymentInfo(majorName) {
    try {
        const majors = await searchMajors(majorName);

        if (majors.length === 0) {
            return null;
        }

        const majorDetail = await getMajorDetail(majors[0].majorSeq);

        if (!majorDetail) {
            return null;
        }

        return {
            majorName: majorDetail.mClass || majorName,
            employmentRate: majorDetail.jobs || null,
            averageSalary: majorDetail.salary || null,
            relatedJobs: majorDetail.job || null,
            universities: majorDetail.univ || null,
            description: majorDetail.summary || null
        };
    } catch (error) {
        console.error('전공 취업 정보 조회 오류:', error.message);
        return null;
    }
}
