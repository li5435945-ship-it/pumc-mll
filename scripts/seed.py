"""种子数据脚本"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed():
    from app.database import engine, async_session
    from app.models import Base, User, Course, Chapter, Question

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == "admin@pumc.edu.cn"))
        if result.scalar_one_or_none():
            print("[WARN] Data already exists, skipping seed")
            return

        # Admin
        admin = User(
            email="admin@pumc.edu.cn",
            password_hash=pwd_ctx.hash("admin123"),
            nickname="管理员",
            role="admin",
        )
        db.add(admin)

        # Students
        student1 = User(email="student1@test.com", password_hash=pwd_ctx.hash("123456"), nickname="张三", role="student")
        student2 = User(email="student2@test.com", password_hash=pwd_ctx.hash("123456"), nickname="李四", role="student")
        db.add(student1)
        db.add(student2)

        # Course
        course = Course(
            name="基础护理学",
            description="护理学基础理论与实践",
            learning_objectives="掌握护理学基本概念、护理程序、护理技术",
            review_prompt="你是一位护理学教授，请根据学生的答题情况给出针对性的点评和建议。点评要简洁明了，指出薄弱点，并给出学习建议。",
            chat_prompt="你是一位护理学教授，请根据学生的问题给出专业、易懂的回答。如果涉及本章教材内容，请优先依据教材回答。",
            recommend_prompt="根据本章内容，推荐3个学生容易出错或需要重点掌握的问题。每个问题用一句话描述。",
            status="published",
        )
        db.add(course)
        await db.flush()

        # Chapters
        chapters_data = [
            {"name": "1. 概论", "sort_order": 1},
            {"name": "2. 护理程序", "sort_order": 2},
            {"name": "3. 医院环境", "sort_order": 3},
        ]
        chapters = []
        for ch_data in chapters_data:
            chapter = Chapter(course_id=course.id, **ch_data)
            db.add(chapter)
            chapters.append(chapter)
        await db.flush()

        # Questions for chapter 1
        questions = [
            ("护理学的创始人是谁？", "南丁格尔", "白求恩", "林巧稚", "钟南山", None, "A", "弗洛伦斯·南丁格尔是现代护理学的创始人。"),
            ("护理的基本职能不包括？", "评估", "诊断", "治疗", "计划", "评价", "C", "治疗是医生的职责，不属于护理基本职能。"),
            ("马斯洛需要层次理论中最基础的是？", "安全需要", "生理需要", "爱与归属", "尊重需要", "自我实现", "B", "生理需要是最基础的需要。"),
            ("不属于护理程序步骤的是？", "评估", "诊断", "手术", "实施", "评价", "C", "手术不属于护理程序。"),
        ]
        for i, q in enumerate(questions):
            question = Question(
                chapter_id=chapters[0].id,
                content=q[0], option_a=q[1], option_b=q[2], option_c=q[3], option_d=q[4], option_e=q[5],
                correct_answer=q[6], explanation=q[7], sort_order=i + 1,
            )
            db.add(question)

        await db.commit()
        print("[OK] Seed data created!")
        print("  Admin: admin@pumc.edu.cn / admin123")
        print("  Student: student1@test.com / 123456")


if __name__ == "__main__":
    asyncio.run(seed())
