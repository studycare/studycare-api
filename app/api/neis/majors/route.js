import { NextResponse } from 'next/server';
import { getSchoolMajors } from '../../../../lib/neis.js';

/**
 * 학교 학과/전공 정보 조회 (나이스 API)
 * GET /api/neis/majors?officeCode=XXX&schoolCode=XXX
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const officeCode = searchParams.get('officeCode');
    const schoolCode = searchParams.get('schoolCode');

    if (!officeCode || !schoolCode) {
        return NextResponse.json({
            success: false,
            message: '교육청코드와 학교코드를 입력하세요'
        }, { status: 400 });
    }

    try {
        const data = await getSchoolMajors(officeCode, schoolCode);

        return NextResponse.json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('학과 정보 조회 오류:', error);
        return NextResponse.json({
            success: false,
            message: '학과 정보 조회 실패',
            error: error.message
        }, { status: 500 });
    }
}