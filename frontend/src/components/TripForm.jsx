import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function TripForm({ onStart, onCancel }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const uniqueMemberCount = new Set(members.map((member) => member.trim().toLocaleLowerCase()).filter(Boolean)).size;

  const updateMember = (index, value) => {
    setMembers((current) => current.map((member, i) => i === index ? value : member));
  };

  const removeMember = (index) => {
    setMembers((current) => current.length > 1 ? current.filter((_, i) => i !== index) : current);
  };

  const submit = (event) => {
    event.preventDefault();
    const cleanMembers = members.map((member) => member.trim()).filter(Boolean);
    if (!cleanMembers.length) return;
    onStart({ name: name.trim(), members: cleanMembers });
  };

  return (
    <form className="trip-form" onSubmit={submit}>
      <label className="field-label">Trip Name
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter a trip name"/>
      </label>

      <fieldset className="members-field">
        <legend>Members <span className="member-count-inline">{uniqueMemberCount}</span></legend>
        <div className="member-inputs">
          {members.map((member, index) => (
            <div className="member-input" key={index}>
              <input aria-label={'Member ' + (index + 1)} required value={member} onChange={(event) => updateMember(index, event.target.value)} placeholder="Member name"/>
              <button className="remove-member" type="button" aria-label={'Remove ' + (member || 'member')} onClick={() => removeMember(index)}><X size={15}/></button>
            </div>
          ))}
        </div>
      </fieldset>

      <button className="button button-link" type="button" onClick={() => setMembers((current) => [...current, ''])}><Plus size={16}/>Add Member</button>
      {!members.length && <p className="form-hint">Add at least one member to start your trip.</p>}
      <div className="trip-form-actions"><button className="button button-primary start-button" type="submit">Start Trip</button>{onCancel && <button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}
