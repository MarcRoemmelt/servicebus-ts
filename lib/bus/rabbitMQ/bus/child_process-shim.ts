import b from '../../../bus-shim';

setTimeout(function () {
    void b().then((bus) => {
        void bus.send('event.22', { msg: 'from-child' });
    });
}, 250);
