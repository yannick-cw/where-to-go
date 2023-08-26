import { useState } from 'react';

export type sport = 'running' | 'riding'

interface SportSelectProps {
    propagateSport: (sport: sport) => void,
    defaultSport: sport
}

function SportSelect({ propagateSport, defaultSport }: SportSelectProps) {
    const [selectedOption, setSelectedOption] = useState<sport>(defaultSport);

    return (
        <div>
            <h2>Select a Sport</h2>
            <select value={selectedOption} onChange={(event) => {
                const sport = event.currentTarget.value as sport;
                setSelectedOption(sport);
                propagateSport(sport);
            }
            }>
                <option value="riding">Bike</option>
                <option value="running">Running</option>
            </select>
        </div>
    );
};

export default SportSelect;