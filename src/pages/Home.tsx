import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-500 to-orange-500 mb-4 animate-fade-in-up">
        J들의 일정 수립 도우미
      </h1>
      <p className="text-lg text-gray-500 dark:text-gray-400 mb-8 max-w-xl text-center">
        J-Plan과 함께 여행 일정을 쉽게 계획하고 지도에서 동선을 확인하세요.
      </p>
      <Link to="/travels" className="px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-full font-semibold transition-all shadow-lg hover:shadow-amber-500/30 transform hover:-translate-y-1">
        새로운 여행 시작하기
      </Link>
    </div>
  );
};

export default Home;
