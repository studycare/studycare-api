import fs from 'fs';
import { parse } from 'csv-parse/sync';

// CSV 파일 경로
const csvPath = './data/universities.csv';
const jsonPath = './data/universities.json';

// CSV 읽기
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// CSV 파싱
const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
});

// JSON 형식으로 변환
const universities = {};

records.forEach(record => {
    const university = record.학교명 || '';
    const campus = record.본분교명 || '';
    const college = record.단과대학명 || '';
    const major = record.학부과전공명 || '';
    const region = record.지역 || '';
    const establishment = record.설립구분 || '';
    const universityType = record.대학구분 || '';
    const schoolType = record.학교구분 || '';
    const dayNight = record.주야구분 || '';
    const majorCharacteristic = record.학과특성 || '';
    const majorStatus = record.학과상태 || '';
    const largeCategory = record.표준분류대계열 || '';
    const middleCategory = record.표준분류중계열 || '';
    const smallCategory = record.표준분류소계열 || '';
    const universityLargeCategory = record.대학자체대계열 || '';
    const studyDuration = record.수업연한 || '';
    const degreeProgram = record.학위과정 || '';
    const surveyYear = record.조사년도 || '';

    // 유효한 데이터만 처리
    if (university && major && majorStatus !== '폐과') {
        const uniKey = university; // 고유 대학 키

        if (!universities[uniKey]) {
            universities[uniKey] = {
                universityInfo: {
                    name: university,
                    campus: campus || '',
                    region: region || '',
                    establishment: establishment || '',
                    universityType: universityType || '',
                    schoolType: schoolType || '',
                    universityLargeCategory: universityLargeCategory || '',
                    surveyYear: surveyYear || ''
                },
                colleges: {},
                majors: []
            };
        }

        // 단과대학별로 그룹화
        const collegeKey = college || '기타';
        if (!universities[uniKey].colleges[collegeKey]) {
            universities[uniKey].colleges[collegeKey] = [];
        }

        const majorData = {
            name: major,
            college: college,
            dayNight: dayNight || '',
            majorCharacteristic: majorCharacteristic || '',
            majorStatus: majorStatus,
            largeCategory: largeCategory || '',
            middleCategory: middleCategory || '',
            smallCategory: smallCategory || '',
            studyDuration: studyDuration || '',
            degreeProgram: degreeProgram || '',
            description: `${largeCategory || ''} ${middleCategory || ''} ${smallCategory || ''}`.trim()
        };

        universities[uniKey].majors.push(majorData);
    }
});

// 각 대학별로 학과 정리
Object.keys(universities).forEach(uniKey => {
    const uni = universities[uniKey];

    // 학과 중복 제거
    const uniqueMajors = {};
    uni.majors.forEach(major => {
        const key = `${major.name}_${major.college}`;
        if (!uniqueMajors[key]) {
            uniqueMajors[key] = major;
        }
    });
    uni.majors = Object.values(uniqueMajors);

    // 단과대학 정보 정리
    uni.colleges = Object.keys(uni.colleges);
});

// JSON 파일 저장
fs.writeFileSync(jsonPath, JSON.stringify(universities, null, 2), 'utf-8');

console.log(`✅ CSV → JSON 변환 완료!`);
console.log(`📊 ${Object.keys(universities).length}개 대학, 총 ${Object.values(universities).reduce((sum, uni) => sum + uni.majors.length, 0)}개 학과`);
console.log(`💾 저장 위치: ${jsonPath}`);

// 일부 데이터 샘플 출력
const sampleUni = Object.keys(universities)[0];
if (sampleUni) {
    console.log(`\n📋 샘플 데이터 (${sampleUni}):`);
    console.log(`- 단과대학: ${universities[sampleUni].colleges.join(', ')}`);
    console.log(`- 학과 수: ${universities[sampleUni].majors.length}`);
    console.log(`- 샘플 학과: ${universities[sampleUni].majors[0]?.name || '없음'}`);
}