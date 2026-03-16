/**
 * @variant IVFTrackShipmentHospital6
 * @hospital Yellow IVF (ID: 6)
 * @route /ivf-track-shipment, /ivf-track-shipment/:tankId
 * Custom IVF Track Shipment for Yellow IVF — same layout, pale yellow background.
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';


export { default } from '../../pages/IVFTrackShipment';
  const navigate = useNavigate();
