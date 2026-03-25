type DateRangeInput = {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
};

function parseLocalDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new Error(`Data invalida: ${value}`);
    }

    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
}

export function buildDateRange({ date, dateFrom, dateTo }: DateRangeInput) {
    const startBase = date
        ? parseLocalDate(date)
        : dateFrom
            ? parseLocalDate(dateFrom)
            : new Date();

    const endBase = date
        ? parseLocalDate(date)
        : dateTo
            ? parseLocalDate(dateTo)
            : startBase;

    const start = new Date(startBase);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endBase);
    end.setHours(23, 59, 59, 999);

    const normalizedDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    return {
        start,
        end,
        normalizedDate,
    };
}
