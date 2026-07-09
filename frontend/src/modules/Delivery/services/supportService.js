import api from '../../../shared/utils/api';

export const createDeliverySupportTicket = async (data) => {
    const res = await api.post('/delivery/support/tickets', data);
    return res.data || res;
};

export const getDeliverySupportTickets = async () => {
    const res = await api.get('/delivery/support/tickets');
    return res.data || res;
};

export const getDeliverySupportTicketTypes = async () => {
    const res = await api.get('/delivery/support/ticket-types');
    return res.data || res;
};

export const replyToDeliverySupportTicket = async (id, message) => {
    const res = await api.post(`/delivery/support/tickets/${id}/message`, { message });
    return res.data || res;
};
