import { NextResponse } from 'next/server';
import { getMealInfo } from '../../../../lib/neis.js';

/**
 * 급식 정보 조회 (나이스 API)
 * GET /api/neis/meal?officeCode=XXX&schoolCode=XXX&date=20240315
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const officeCode = searchParams.get('officeCode');
    const schoolCode = searchParams.get('schoolCode');
    const date = searchParams.get('date');

    if (!officeCode || !schoolCode) {
        return NextResponse.json({
            success: false,
            message: '교육청코드와 학교코드를 입력하세요'
        }, { status: 400 });
    }

    try {
        const data = await getMealInfo(officeCode, schoolCode, date);

        return NextResponse.json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('급식 정보 조회 오류:', error);
        return NextResponse.json({
            success: false,
            message: '급식 정보 조회 실패',
            error: error.message
        }, { status: 500 });
    }
}