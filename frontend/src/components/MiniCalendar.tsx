interface CalendarDay {
  date: string;
  count: number;
  passengers: number;
}

interface MiniCalendarProps {
  selectedDate: string;
  calendarData: CalendarDay[];
  onSelectDate: (date: string) => void;
  onMonthChange: (yearMonth: string) => void;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function parseYearMonth(dateStr: string): [number, number] {
  const [y, m] = dateStr.split('-').map(Number);
  return [y, m];
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = parseYearMonth(yearMonth + '-01');
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function getMonthLabel(yearMonth: string): string {
  const [y, m] = parseYearMonth(yearMonth + '-01');
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MiniCalendar({
  selectedDate,
  calendarData,
  onSelectDate,
  onMonthChange,
}: MiniCalendarProps) {
  const today = todayStr();
  const currentYearMonth = selectedDate.slice(0, 7);
  const [year, month] = parseYearMonth(selectedDate);

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const countsByDate = new Map(calendarData.map((d) => [d.date, d]));

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function handlePrev() {
    const prev = shiftMonth(currentYearMonth, -1);
    onMonthChange(prev);
    onSelectDate(prev + '-01');
  }

  function handleNext() {
    const next = shiftMonth(currentYearMonth, 1);
    onMonthChange(next);
    onSelectDate(next + '-01');
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={handlePrev}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-slate-900">
          {getMonthLabel(currentYearMonth)}
        </span>
        <button
          onClick={handleNext}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-10" />;
          }

          const dateStr = toDateStr(year, month, day);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const data = countsByDate.get(dateStr);
          const hasBookings = data && data.count > 0;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`h-10 flex flex-col items-center justify-center rounded-lg text-sm transition-colors cursor-pointer relative
                ${isSelected ? 'bg-sky-500 text-white' : ''}
                ${!isSelected && isToday ? 'ring-1 ring-sky-400 text-sky-600 font-semibold' : ''}
                ${!isSelected && !isToday ? 'text-slate-700 hover:bg-slate-100' : ''}
              `}
            >
              <span className="leading-none">{day}</span>
              {hasBookings && (
                <span
                  className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-sky-500'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Today shortcut */}
      {selectedDate.slice(0, 7) !== today.slice(0, 7) && (
        <button
          onClick={() => {
            const todayYm = today.slice(0, 7);
            onMonthChange(todayYm);
            onSelectDate(today);
          }}
          className="w-full text-center text-xs text-sky-600 hover:text-sky-500 font-medium mt-2 cursor-pointer"
        >
          Go to today
        </button>
      )}
    </div>
  );
}
