import { NextResponse } from 'next/server';
import { getSchoolSchedule } from '../../../../lib/neis.js';

/**
 * 학교 학사일정 조회 (나이스 API)
 * GET /api/neis/schedule?officeCode=XXX&schoolCode=XXX&year=2024&month=03
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const officeCode = searchParams.get('officeCode');
    const schoolCode = searchParams.get('schoolCode');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!officeCode || !schoolCode) {
        return NextResponse.json({
            success: false,
            message: '교육청코드와 학교코드를 입력하세요'
        }, { status: 400 });
    }

    try {
        const data = await getSchoolSchedule(officeCode, schoolCode, year, month);

        return NextResponse.json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('학사일정 조회 오류:', error);
        return NextResponse.json({
            success: false,
            message: '학사일정 조회 실패',
            error: error.message
        }, { status: 500 });
    }
}