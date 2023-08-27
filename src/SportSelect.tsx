
export type sport = 'running' | 'riding'

interface SportSelectProps {
    setSport: (sport: sport) => void,
    sport: sport
}

function SportSelect({ setSport, sport }: SportSelectProps) {

    return (
        <div>
            <h2>Select a Sport</h2>
            <select value={sport} onChange={(event) => {
                const sport = event.currentTarget.value as sport;
                setSport(sport);
            }
            }>
                <option value="riding">Bike</option>
                <option value="running">Running</option>
            </select>
        </div>
    );
};

export default SportSelect;