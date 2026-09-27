import { Map, TentTree, UsersRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export function CampaignTabs() {
  return <nav className="campaign-tabs" aria-label="戰役功能">
    <NavLink to="/campaigns/wagon"><TentTree aria-hidden="true" /><span>馬車</span></NavLink>
    <NavLink to="/campaigns/map"><Map aria-hidden="true" /><span>地圖</span></NavLink>
    <NavLink to="/campaigns/characters"><UsersRound aria-hidden="true" /><span>角色</span></NavLink>
  </nav>;
}

