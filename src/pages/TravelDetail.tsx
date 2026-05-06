import { differenceInDays, parseISO } from 'date-fns';
import { ArrowLeft, CalendarDays, Download, Home as HomeIcon, Map as MapIcon, Maximize2, Minimize2, Plus, Printer } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AccommodationModal from '../components/travel/AccommodationModal';
import ItineraryModal from '../components/travel/ItineraryModal';
import GoogleMapView from '../components/travel/GoogleMapView';
import TimeTable from '../components/travel/TimeTable';
import { useTravelStore } from '../store/travelStore';
import type { Itinerary, TravelExportData } from '../types/travel';

const TravelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { travels, itineraries, accommodations, isLoading, fetchTravels, fetchTravelDetail, deleteItinerary } = useTravelStore();
  
  useEffect(() => {
    if (travels.length === 0) {
      fetchTravels();
    }
    if (id) {
      fetchTravelDetail(id);
    }
  }, [id, fetchTravels, fetchTravelDetail, travels.length]);

  const travel = travels.find((t) => t.id === id);
  const totalDays = travel ? differenceInDays(parseISO(travel.endDate), parseISO(travel.startDate)) + 1 : 1;

  const [isItineraryModalOpen, setItineraryModalOpen] = useState(false);
  const [editItineraryTarget, setEditItineraryTarget] = useState<Itinerary | null>(null);
  
  const [isAccModalOpen, setAccModalOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'timeline' | 'map'>('timeline'); // Mobile Only
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [isMapExpanded, setIsMapExpanded] = useState(false); // Desktop Map Toggle
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null); // Panning target

  // 선택된 일정 자동 스크롤
  useEffect(() => {
    if (selectedItineraryId) {
      const el = document.getElementById(`itinerary-${selectedItineraryId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedItineraryId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!travel) {
    return (
      <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold mb-4">존재하지 않거나 삭제된 여행입니다.</h2>
        <button onClick={() => navigate('/travels')} className="text-amber-600 hover:underline font-medium">목록으로 돌아가기</button>
      </div>
    );
  }

  // 필터링 및 정렬
  const filteredItineraries = itineraries
    .filter((i) => i.travelId === id && (selectedDay === 'all' || i.dayIndex === selectedDay))
    .sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.time.localeCompare(b.time);
    });

  const travelAccommodations = accommodations.filter((a) => a.travelId === id).sort((a, b) => a.dayIndex - b.dayIndex);

  const handleEdit = (e: React.MouseEvent, iti: Itinerary) => {
    e.stopPropagation();
    setEditItineraryTarget(iti);
    setItineraryModalOpen(true);
  };

  const handleDelete = (e: React.MouseEvent, itiId: string) => {
    e.stopPropagation();
    if (window.confirm('일정을 정말 삭제하시겠습니까?')) {
      deleteItinerary(itiId);
    }
  };

  const handleOpenNewItinerary = () => {
    setEditItineraryTarget(null);
    setItineraryModalOpen(true);
  };

  const handleItineraryClick = (itiId: string) => {
    setSelectedItineraryId(itiId);
    if (window.innerWidth < 1024) {
      setActiveTab('map'); // 모바일에서는 지도로 탭 전환
    }
  };

  const handleExportJSON = () => {
    if (!travel) return;
    const exportData: TravelExportData = {
      version: '1.0',
      travel: travel,
      itineraries: itineraries.filter(i => i.travelId === id), // travel에 속한 전체 일정
      accommodations: travelAccommodations
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jplan_${travel.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handlePrint = () => {
    // 인쇄 시 다크모드를 강제로 끄기 위해 HTML 태그에서 dark 클래스 임시 제거
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
    }
    
    // 약간의 딜레이를 주어 렌더링 반영 후 인쇄
    setTimeout(() => {
      window.print();
      // 인쇄 창이 닫히면 원래 상태로 복구
      if (isDark) {
        document.documentElement.classList.add('dark');
      }
    }, 100);
  };

  return (
    <div className="animate-fade-in-up flex flex-col flex-1 overflow-hidden print:overflow-visible print:h-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 shrink-0 gap-4 print:hidden">
        <div className="flex items-center space-x-4">
          <Link to="/travels" className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              {travel.name}
              <button onClick={handleExportJSON} title="일정 JSON 내보내기" className="text-gray-400 hover:text-amber-600 transition-colors">
                <Download size={20} />
              </button>
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{travel.startDate} ~ {travel.endDate}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 self-end sm:self-auto">
          <button onClick={handlePrint} className="flex items-center space-x-1 px-3 py-2 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <Printer size={16} />
            <span className="hidden sm:inline">출력</span>
          </button>
          <button onClick={() => setAccModalOpen(true)} className="flex items-center space-x-1 px-3 py-2 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors">
            <HomeIcon size={16} />
            <span className="hidden sm:inline">숙소 설정</span>
          </button>
          <button onClick={handleOpenNewItinerary} className="flex items-center space-x-1 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm">
            <Plus size={16} />
            <span className="hidden sm:inline">일정 추가</span>
          </button>
        </div>
      </div>

      {/* Day Filter & Mobile View Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-3 print:hidden">
        {/* Day Filters */}
        <div className="flex space-x-2 overflow-x-auto pb-1 w-full sm:w-auto scrollbar-hide">
          <button 
            onClick={() => setSelectedDay('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedDay === 'all' ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
          >
            전체 일정
          </button>
          {Array.from({ length: totalDays }).map((_, i) => (
            <button 
              key={i + 1}
              onClick={() => setSelectedDay(i + 1)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedDay === i + 1 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
            >
              {i + 1}일차
            </button>
          ))}
        </div>

        {/* View Toggle (Mobile) & Map Expand (Desktop) */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {/* Mobile Tab */}
          <div className="flex sm:hidden w-full bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button onClick={() => setActiveTab('timeline')} className={`flex-1 py-1.5 text-sm font-medium rounded-md flex justify-center items-center space-x-2 ${activeTab === 'timeline' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>
              <CalendarDays size={16} /><span>타임라인</span>
            </button>
            <button onClick={() => setActiveTab('map')} className={`flex-1 py-1.5 text-sm font-medium rounded-md flex justify-center items-center space-x-2 ${activeTab === 'map' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>
              <MapIcon size={16} /><span>지도</span>
            </button>
          </div>
          {/* Desktop Map Toggle */}
          <button 
            onClick={() => setIsMapExpanded(!isMapExpanded)}
            className="hidden lg:flex items-center space-x-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            {isMapExpanded ? <><Maximize2 size={16} /><span>타임라인 뷰</span></> : <><Minimize2 size={16} /><span>지도 뷰 접기</span></>}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden print:overflow-visible print:h-auto gap-6 relative">
        {/* Timeline */}
        <div className={`w-full ${isMapExpanded ? 'lg:w-full' : 'lg:w-1/3'} flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden print:border-none print:w-full print:block print:overflow-visible print:h-auto ${activeTab === 'timeline' ? 'flex' : 'hidden lg:flex'} transition-all duration-300`}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center print:hidden">
            <h3 className="font-semibold flex items-center space-x-2"><CalendarDays size={18} /><span>일정 타임라인</span></h3>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col p-2 space-y-4 print:overflow-visible print:block print:h-auto">
            {filteredItineraries.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm overflow-y-auto">해당 일정에 등록된 일정이 없습니다.</div>
            ) : (
              <TimeTable
                itineraries={filteredItineraries}
                selectedDay={selectedDay}
                isMapExpanded={isMapExpanded}
                totalDays={totalDays}
                selectedItineraryId={selectedItineraryId}
                onItineraryClick={handleItineraryClick}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}

            {/* 숙소 정보 표시 */}
            {travelAccommodations.filter(acc => selectedDay === 'all' || acc.dayIndex === selectedDay).length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                <h4 className="font-semibold text-sm mb-4 flex items-center space-x-2"><HomeIcon size={16} /><span>{selectedDay === 'all' ? '일차별 숙소 정보' : `${selectedDay}일차 숙소`}</span></h4>
                <div 
                  className={`grid gap-3 overflow-y-auto scrollbar-thin ${isMapExpanded ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1'}`}
                  style={{ maxHeight: '190px' }}
                >
                  {travelAccommodations
                    .filter(acc => selectedDay === 'all' || acc.dayIndex === selectedDay)
                    .map(acc => (
                    <div 
                      key={acc.id} 
                      onClick={() => handleItineraryClick(acc.id)}
                      className={`rounded-lg p-3 border transition-colors cursor-pointer ${
                        selectedItineraryId === acc.id
                          ? 'bg-amber-100 border-amber-400 dark:bg-amber-900/60 dark:border-amber-500 ring-2 ring-amber-500'
                          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                      }`}
                    >
                      <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">{acc.dayIndex}일차</div>
                      <div className="font-bold text-sm text-gray-800 dark:text-gray-200">{acc.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{acc.address || '주소 없음'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Map View */}
        {!isMapExpanded && (
          <div className={`w-full lg:w-2/3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex items-center justify-center print:hidden ${activeTab === 'map' ? 'flex' : 'hidden lg:flex'} z-0 relative transition-all duration-300`}>
            <GoogleMapView 
              itineraries={filteredItineraries} 
              accommodations={travelAccommodations}
              selectedDay={selectedDay}
              selectedItineraryId={selectedItineraryId} 
              onMarkerClick={handleItineraryClick}
            />
          </div>
        )}
      </div>

      <ItineraryModal isOpen={isItineraryModalOpen} onClose={() => setItineraryModalOpen(false)} travelId={id!} editTarget={editItineraryTarget} />
      <AccommodationModal isOpen={isAccModalOpen} onClose={() => setAccModalOpen(false)} travelId={id!} />
    </div>
  );
};

export default TravelDetail;
