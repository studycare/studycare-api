import { NextResponse } from 'next/server';
import { getSchoolCurriculum } from '../../../../lib/neis.js';

/**
 * 학교 교육과정 조회 (나이스 API)
 * GET /api/neis/curriculum?officeCode=XXX&schoolCode=XXX&year=2024
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const officeCode = searchParams.get('officeCode');
    const schoolCode = searchParams.get('schoolCode');
    const year = searchParams.get('year');

    if (!officeCode || !schoolCode) {
        return NextResponse.json({
            success: false,
            message: '교육청코드와 학교코드를 입력하세요'
        }, { status: 400 });
    }

    try {
        const data = await getSchoolCurriculum(officeCode, schoolCode, year);

        return NextResponse.json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('교육과정 조회 오류:', error);
        return NextResponse.json({
            success: false,
            message: '교육과정 조회 실패',
            error: error.message
        }, { status: 500 });
    }
}